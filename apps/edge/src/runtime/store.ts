import {
  HostedError,
  hashValue,
  type HostedEnv,
  type HostedStore,
  type HostedBudget,
  type PendingQuoteSummary,
  type StoredRecord,
  type RecordInput,
  type QuoteInput,
  type ConsumeQuoteInput,
  type ReservationReceipt,
  type PaidOperation,
} from "./contracts";

export const MAX_HOSTED_TTL = 15 * 60000;
export const INITIAL_HOSTED_SPEND: HostedBudget = {
  creditsUsed: 51,
  creditsLimit: 100,
  usdMicroUsed: 111000,
  usdMicroLimit: 5000000,
};
interface RecordRow {
  namespace: string;
  id: string;
  owner_hash: string;
  revision: number;
  expires_at: number;
  created_at: number;
  updated_at: number;
  iv: string;
  ciphertext: string;
}
interface QuoteRow {
  id: string;
  owner_hash: string;
  operation: PaidOperation;
  terms_hash: string;
  credits: number;
  usd_micro: number;
  expires_at: number;
  created_at: number;
  iv: string;
  ciphertext: string;
  consumed_by: string | null;
  record_namespace: string | null;
  continuation_expires_at: number | null;
  approved_at: number | null;
  approved_by_hash: string | null;
  approval_expires_at: number | null;
  revoked_at: number | null;
}
interface ReservationRow {
  id: string;
  quote_id: string;
  owner_hash: string;
  budget_id: string;
  operation: PaidOperation;
  terms_hash: string;
  credits: number;
  usd_micro: number;
  created_at: number;
  record_namespace: string;
  record_id: string;
  record_expires_at: number;
  operator_authorized: number;
}
interface BudgetRow {
  id: string;
  credits_used: number;
  credits_limit: number;
  usd_micro_used: number;
  usd_micro_limit: number;
}
const identifier = (value: string, label: string) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9:_-]{1,200}$/.test(value))
    throw new HostedError(400, `Invalid ${label}.`);
  return value;
};
const ownerHash = (owner: string) => {
  if (typeof owner !== "string" || !owner || owner.length > 300)
    throw new HostedError(400, "Invalid record owner.");
  return hashValue(["true-beauty-hosted-owner-v1", owner]);
};
const encode = (bytes: Uint8Array) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 32768)
    value += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(value);
};
const decode = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const recordAAD = (
  row: Pick<
    RecordRow,
    "namespace" | "id" | "owner_hash" | "revision" | "expires_at" | "created_at"
  >,
) =>
  JSON.stringify([
    "record-v1",
    row.namespace,
    row.id,
    row.owner_hash,
    row.revision,
    row.expires_at,
    row.created_at,
  ]);
const quoteAAD = (
  row: Pick<
    QuoteRow,
    | "id"
    | "owner_hash"
    | "operation"
    | "terms_hash"
    | "credits"
    | "usd_micro"
    | "expires_at"
    | "created_at"
  >,
) =>
  JSON.stringify([
    "quote-v1",
    row.id,
    row.owner_hash,
    row.operation,
    row.terms_hash,
    row.credits,
    row.usd_micro,
    row.expires_at,
    row.created_at,
  ]);
function serializedValue(value: unknown) {
  const seen = new Set<object>();
  const inspect = (item: unknown): void => {
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (
      typeof item !== "object" ||
      ArrayBuffer.isView(item) ||
      item instanceof ArrayBuffer ||
      (typeof Blob !== "undefined" && item instanceof Blob)
    )
      throw new HostedError(
        400,
        "Hosted state must be finite JSON; binary images and frames are not stored.",
      );
    if (seen.has(item))
      throw new HostedError(400, "Hosted JSON must not contain cycles.");
    seen.add(item);
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      throw new HostedError(400, "Hosted state must use plain JSON objects.");
    for (const [key, nested] of Object.entries(item)) {
      if (
        ["__proto__", "constructor", "prototype"].includes(key) ||
        /^(?:api_?key|access_?token|authorization|password|private_?key)$/i.test(
          key,
        )
      )
        throw new HostedError(
          400,
          "Credentials and unsafe object fields cannot be persisted.",
        );
      if (nested !== undefined) inspect(nested);
    }
    seen.delete(item);
  };
  inspect(value);
  const serialized = JSON.stringify({ version: 1, value });
  if (new TextEncoder().encode(serialized).length > 256 * 1024)
    throw new HostedError(413, "The encrypted state record exceeds 256 KB.");
  return serialized;
}
function validateExpiry(expiresAt: number, now: number, createdAt = now) {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now)
    throw new HostedError(410, "This state has expired.");
  if (expiresAt > createdAt + MAX_HOSTED_TTL)
    throw new HostedError(
      400,
      "Hosted state retention is limited to its original 15-minute lifetime.",
    );
}
const budgetView = (row: BudgetRow): HostedBudget => ({
  creditsUsed: row.credits_used,
  creditsLimit: row.credits_limit,
  usdMicroUsed: row.usd_micro_used,
  usdMicroLimit: row.usd_micro_limit,
});
const receipt = (row: ReservationRow): ReservationReceipt => ({
  id: row.id,
  quoteId: row.quote_id,
  operation: row.operation,
  credits: row.credits,
  usdMicro: row.usd_micro,
  createdAt: row.created_at,
});

export function createHostedStore(
  env: HostedEnv,
  now: () => number = Date.now,
): HostedStore {
  const db = env.DB,
    budgetId = identifier(
      env.EDGE_BUDGET_ID ?? "true-beauty-global-r07",
      "budget identifier",
    );
  let keyPromise: Promise<CryptoKey> | undefined;
  const encryptionKey = () =>
    (keyPromise ??= (async () => {
      if (
        typeof env.EDGE_DATA_SECRET !== "string" ||
        new TextEncoder().encode(env.EDGE_DATA_SECRET).length < 32
      )
        throw new HostedError(503, "Hosted encryption is not configured.");
      const material = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(env.EDGE_DATA_SECRET),
      );
      return crypto.subtle.importKey("raw", material, "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]);
    })());
  async function nextRevision() {
    const row = await db
      .prepare("INSERT INTO tb_hosted_epochs DEFAULT VALUES RETURNING id")
      .first<{ id: number }>();
    if (!row || !Number.isSafeInteger(row.id) || row.id <= 0)
      throw new HostedError(
        503,
        "The hosted revision sequence could not be allocated.",
      );
    await db
      .prepare("DELETE FROM tb_hosted_epochs WHERE id = ?")
      .bind(row.id)
      .run();
    return row.id;
  }
  async function seal(value: unknown, aad: string) {
    const serialized = serializedValue(value),
      plaintext = new TextEncoder().encode(serialized),
      iv = crypto.getRandomValues(new Uint8Array(12));
    try {
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: new TextEncoder().encode(aad),
          tagLength: 128,
        },
        await encryptionKey(),
        plaintext,
      );
      return {
        iv: encode(iv),
        ciphertext: encode(new Uint8Array(ciphertext)),
        value: JSON.parse(serialized).value as unknown,
      };
    } finally {
      plaintext.fill(0);
    }
  }
  async function unseal<T>(
    row: { iv: string; ciphertext: string },
    aad: string,
  ): Promise<T> {
    let plaintext: Uint8Array | undefined;
    try {
      const iv = decode(row.iv);
      if (iv.length !== 12) throw new Error("IV");
      plaintext = new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv,
            additionalData: new TextEncoder().encode(aad),
            tagLength: 128,
          },
          await encryptionKey(),
          decode(row.ciphertext),
        ),
      );
      const parsed = JSON.parse(new TextDecoder().decode(plaintext));
      if (parsed.version !== 1 || !Object.hasOwn(parsed, "value"))
        throw new Error("format");
      return parsed.value as T;
    } catch (error) {
      if (error instanceof HostedError) throw error;
      throw new HostedError(
        503,
        "Encrypted hosted state could not be authenticated.",
      );
    } finally {
      plaintext?.fill(0);
    }
  }
  async function rawRecord(namespace: string, id: string, hash: string) {
    return db
      .prepare(
        "SELECT * FROM tb_hosted_records WHERE namespace = ? AND id = ? AND owner_hash = ? AND expires_at > ?",
      )
      .bind(
        identifier(namespace, "namespace"),
        identifier(id, "record identifier"),
        hash,
        now(),
      )
      .first<RecordRow>();
  }
  async function rawQuote(id: string, hash: string) {
    return db
      .prepare("SELECT * FROM tb_hosted_quotes WHERE id = ? AND owner_hash = ?")
      .bind(identifier(id, "quote identifier"), hash)
      .first<QuoteRow>();
  }
  async function budget() {
    const row = await db
      .prepare("SELECT * FROM tb_hosted_budgets WHERE id = ?")
      .bind(budgetId)
      .first<BudgetRow>();
    if (!row)
      throw new HostedError(
        503,
        "The operator must reconcile prior spending before paid dispatch is enabled.",
      );
    return budgetView(row);
  }
  async function access(
    row: QuoteRow | null,
    hash: string,
    operator: boolean,
    continuation = false,
  ): Promise<{ approved: boolean; reason: string }> {
    if (!row || row.owner_hash !== hash)
      return { approved: false, reason: "This quote is unavailable." };
    if (row.revoked_at !== null)
      return {
        approved: false,
        reason: "This exact quote authorization was revoked.",
      };
    if (row.consumed_by) {
      const reservation = await db
        .prepare(
          "SELECT * FROM tb_hosted_reservations WHERE quote_id = ? AND owner_hash = ?",
        )
        .bind(row.id, hash)
        .first<ReservationRow>();
      if (
        !reservation ||
        reservation.record_expires_at <= now() ||
        !row.record_namespace
      )
        return {
          approved: false,
          reason: "The initial reservation has expired.",
        };
      const record = await rawRecord(
        row.record_namespace,
        row.consumed_by,
        hash,
      );
      if (!record || record.expires_at !== reservation.record_expires_at)
        return {
          approved: false,
          reason: "The reserved task was removed or expired.",
        };
      if (row.approved_at === null || (row.approval_expires_at ?? 0) <= now())
        return {
          approved: false,
          reason: "The task-scoped authorization has expired.",
        };
      return {
        approved: true,
        reason:
          "The exact initial reservation remains authorized; no new budget is reserved.",
      };
    }
    if (continuation)
      return {
        approved: false,
        reason: "This task has no initial approved reservation.",
      };
    if (row.expires_at <= now())
      return { approved: false, reason: "This quote has expired." };
    if (
      operator ||
      (row.approved_at !== null && (row.approval_expires_at ?? 0) > now())
    )
      return {
        approved: true,
        reason: operator
          ? "The current operator may authorize this exact quote."
          : "This exact quote has a valid operator approval.",
      };
    return {
      approved: false,
      reason: "An operator must approve this exact quote before dispatch.",
    };
  }
  const store: HostedStore = {
    async get<T>(namespace: string, id: string, owner: string) {
      const hash = await ownerHash(owner),
        row = await rawRecord(namespace, id, hash);
      if (!row) {
        await db
          .prepare(
            "DELETE FROM tb_hosted_records WHERE namespace = ? AND id = ? AND owner_hash = ? AND expires_at <= ?",
          )
          .bind(namespace, id, hash, now())
          .run();
        return null;
      }
      const value = await unseal<T>(row, recordAAD(row));
      const current = await rawRecord(namespace, id, hash);
      if (
        !current ||
        current.revision !== row.revision ||
        current.ciphertext !== row.ciphertext
      )
        return null;
      return {
        namespace,
        id,
        owner,
        revision: row.revision,
        expiresAt: row.expires_at,
        value,
      };
    },
    async insert<T>(input: RecordInput<T>) {
      const created = now();
      validateExpiry(input.expiresAt, created);
      const hash = await ownerHash(input.owner),
        row = {
          namespace: identifier(input.namespace, "namespace"),
          id: identifier(input.id, "record identifier"),
          owner_hash: hash,
          revision: await nextRevision(),
          expires_at: input.expiresAt,
          created_at: created,
          updated_at: created,
        };
      const encrypted = await seal(input.value, recordAAD(row));
      const result = await db
        .prepare(
          "INSERT INTO tb_hosted_records (namespace,id,owner_hash,revision,expires_at,created_at,updated_at,iv,ciphertext) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET owner_hash=excluded.owner_hash,revision=excluded.revision,expires_at=excluded.expires_at,created_at=excluded.created_at,updated_at=excluded.updated_at,iv=excluded.iv,ciphertext=excluded.ciphertext WHERE tb_hosted_records.expires_at <= ?",
        )
        .bind(
          row.namespace,
          row.id,
          hash,
          row.revision,
          row.expires_at,
          created,
          created,
          encrypted.iv,
          encrypted.ciphertext,
          created,
        )
        .run();
      if (result.meta?.changes !== 1)
        throw new HostedError(409, "This state record already exists.");
      return { ...input, revision: row.revision, value: encrypted.value as T };
    },
    async compareAndSwap<T>(input: RecordInput<T> & { revision: number }) {
      const hash = await ownerHash(input.owner),
        row = await rawRecord(input.namespace, input.id, hash);
      if (!row || row.revision !== input.revision) return null;
      validateExpiry(input.expiresAt, now(), row.created_at);
      const next = {
          ...row,
          revision: await nextRevision(),
          expires_at: input.expiresAt,
          updated_at: now(),
        },
        encrypted = await seal(input.value, recordAAD(next));
      const result = await db
        .prepare(
          "UPDATE tb_hosted_records SET revision=?,expires_at=?,updated_at=?,iv=?,ciphertext=? WHERE namespace=? AND id=? AND owner_hash=? AND revision=? AND expires_at > ?",
        )
        .bind(
          next.revision,
          next.expires_at,
          next.updated_at,
          encrypted.iv,
          encrypted.ciphertext,
          row.namespace,
          row.id,
          hash,
          row.revision,
          now(),
        )
        .run();
      if (result.meta?.changes !== 1) return null;
      return {
        namespace: row.namespace,
        id: row.id,
        owner: input.owner,
        revision: next.revision,
        expiresAt: next.expires_at,
        value: encrypted.value as T,
      };
    },
    async delete(namespace, id, owner) {
      const hash = await ownerHash(owner);
      const result = await db
        .prepare(
          "DELETE FROM tb_hosted_records WHERE namespace=? AND id=? AND owner_hash=?",
        )
        .bind(
          identifier(namespace, "namespace"),
          identifier(id, "record identifier"),
          hash,
        )
        .run();
      return result.meta?.changes === 1;
    },
    async list<T>(namespace: string, owner: string, limit = 50) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new HostedError(400, "Select at most 100 records.");
      const hash = await ownerHash(owner),
        rows = await db
          .prepare(
            "SELECT id FROM tb_hosted_records WHERE namespace=? AND owner_hash=? AND expires_at > ? ORDER BY created_at DESC LIMIT ?",
          )
          .bind(identifier(namespace, "namespace"), hash, now(), limit)
          .all<{ id: string }>();
      const values: StoredRecord<T>[] = [];
      for (const row of rows.results) {
        const value = await store.get<T>(namespace, row.id, owner);
        if (value) values.push(value);
      }
      return values;
    },
    async createQuote<T>(input: QuoteInput<T>) {
      const created = now();
      validateExpiry(input.expiresAt, created);
      if (
        !["skin", "hair", "clothing", "reasoning"].includes(input.operation) ||
        !/^[a-f0-9]{64}$/.test(input.termsHash) ||
        !Number.isSafeInteger(input.credits) ||
        input.credits < 0 ||
        input.credits > 100 ||
        !Number.isSafeInteger(input.usdMicro) ||
        input.usdMicro < 0 ||
        input.usdMicro > 5000000
      )
        throw new HostedError(
          400,
          "Invalid quote operation, hash or bounded amount.",
        );
      const hash = await ownerHash(input.owner),
        row = {
          id: identifier(input.id, "quote identifier"),
          owner_hash: hash,
          operation: input.operation,
          terms_hash: input.termsHash,
          credits: input.credits,
          usd_micro: input.usdMicro,
          expires_at: input.expiresAt,
          created_at: created,
        };
      const encrypted = await seal(input.value, quoteAAD(row));
      try {
        await db
          .prepare(
            "INSERT INTO tb_hosted_quotes (id,owner_hash,operation,terms_hash,credits,usd_micro,expires_at,created_at,iv,ciphertext) VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            row.id,
            hash,
            row.operation,
            row.terms_hash,
            row.credits,
            row.usd_micro,
            row.expires_at,
            created,
            encrypted.iv,
            encrypted.ciphertext,
          )
          .run();
      } catch {
        throw new HostedError(409, "This quote identifier already exists.");
      }
      return { ...input, consumedBy: null, value: encrypted.value as T };
    },
    async getQuote<T>(id: string, owner: string) {
      const hash = await ownerHash(owner),
        row = await rawQuote(id, hash);
      if (!row || row.expires_at <= now()) return null;
      const value = await unseal<T>(row, quoteAAD(row));
      const current = await rawQuote(id, hash);
      if (
        !current ||
        current.expires_at <= now() ||
        current.ciphertext !== row.ciphertext
      )
        return null;
      return {
        id: row.id,
        owner,
        operation: row.operation,
        termsHash: row.terms_hash,
        credits: row.credits,
        usdMicro: row.usd_micro,
        expiresAt: row.expires_at,
        consumedBy: current.consumed_by,
        value,
      };
    },
    async consumeQuoteAndCreate<T>(input: ConsumeQuoteInput<T>) {
      const hash = await ownerHash(input.owner),
        quote = await rawQuote(input.quoteId, hash);
      if (
        !quote ||
        quote.operation !== input.operation ||
        quote.terms_hash !== input.termsHash
      )
        throw new HostedError(
          403,
          "The exact quote, owner or operation does not match.",
        );
      await unseal(quote, quoteAAD(quote));
      const namespace = identifier(input.record.namespace, "namespace"),
        id = identifier(input.record.id, "record identifier");
      const recover = async () => {
        const reservation = await db
          .prepare(
            "SELECT * FROM tb_hosted_reservations WHERE quote_id=? AND owner_hash=?",
          )
          .bind(quote.id, hash)
          .first<ReservationRow>();
        if (!reservation) return null;
        if (
          reservation.record_namespace !== namespace ||
          reservation.record_id !== id ||
          reservation.operation !== input.operation ||
          reservation.terms_hash !== input.termsHash
        )
          throw new HostedError(
            409,
            "This quote already belongs to a different task record.",
          );
        const permission = await access(
          await rawQuote(quote.id, hash),
          hash,
          input.operator,
          true,
        );
        if (!permission.approved) throw new HostedError(403, permission.reason);
        const record = await store.get<T>(namespace, id, input.owner);
        if (!record)
          throw new HostedError(
            410,
            "The reserved task was deleted or expired.",
          );
        return { record, reservation: receipt(reservation), created: false };
      };
      if (quote.consumed_by) {
        const existing = await recover();
        if (!existing)
          throw new HostedError(
            503,
            "The initial reservation metadata is inconsistent.",
          );
        return existing;
      }
      const permission = await access(quote, hash, input.operator);
      if (!permission.approved) throw new HostedError(403, permission.reason);
      await budget();
      const created = now();
      validateExpiry(input.record.expiresAt, created);
      const recordRow = {
          namespace,
          id,
          owner_hash: hash,
          revision: await nextRevision(),
          expires_at: input.record.expiresAt,
          created_at: created,
          updated_at: created,
        },
        encrypted = await seal(input.record.value, recordAAD(recordRow));
      try {
        await db.batch([
          db
            .prepare(
              "INSERT INTO tb_hosted_records (namespace,id,owner_hash,revision,expires_at,created_at,updated_at,iv,ciphertext) VALUES (?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              namespace,
              id,
              hash,
              recordRow.revision,
              input.record.expiresAt,
              created,
              created,
              encrypted.iv,
              encrypted.ciphertext,
            ),
          db
            .prepare(
              "INSERT INTO tb_hosted_reservations (id,quote_id,owner_hash,budget_id,operation,terms_hash,credits,usd_micro,created_at,record_namespace,record_id,record_expires_at,operator_authorized) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              quote.id,
              quote.id,
              hash,
              budgetId,
              quote.operation,
              quote.terms_hash,
              quote.credits,
              quote.usd_micro,
              created,
              namespace,
              id,
              input.record.expiresAt,
              input.operator ? 1 : 0,
            ),
        ]);
      } catch (error) {
        const recovered = await recover();
        if (recovered) return recovered;
        const message = String(error);
        if (message.includes("hosted_budget_uninitialized"))
          throw new HostedError(
            503,
            "The operator must reconcile prior spending before paid dispatch.",
          );
        if (message.includes("hosted_budget_exceeded"))
          throw new HostedError(
            429,
            "The shared operator spending ceiling has been reached.",
          );
        if (message.includes("hosted_quote_denied"))
          throw new HostedError(
            403,
            "The exact quote expired, was revoked or lost its operator approval.",
          );
        if (message.includes("UNIQUE") || message.includes("constraint"))
          throw new HostedError(409, "The task record already exists.");
        throw new HostedError(
          503,
          "The atomic quote reservation could not be completed.",
        );
      }
      return {
        record: {
          ...input.record,
          owner: input.owner,
          revision: recordRow.revision,
          value: encrypted.value as T,
        },
        reservation: {
          id: quote.id,
          quoteId: quote.id,
          operation: quote.operation,
          credits: quote.credits,
          usdMicro: quote.usd_micro,
          createdAt: created,
        },
        created: true,
      };
    },
    async assertContinuation(quoteId, owner, operator) {
      const hash = await ownerHash(owner),
        permission = await access(
          await rawQuote(quoteId, hash),
          hash,
          operator,
          true,
        );
      if (!permission.approved) throw new HostedError(403, permission.reason);
    },
    async quoteAccess(quoteId, owner, operator) {
      const hash = await ownerHash(owner);
      return access(await rawQuote(quoteId, hash), hash, operator);
    },
    async approveQuote(quoteId, operatorId) {
      const operatorHash = await ownerHash(operatorId),
        time = now();
      const result = await db
        .prepare(
          "UPDATE tb_hosted_quotes SET approved_at=?,approved_by_hash=?,revoked_at=NULL,revoked_by_hash=NULL,approval_expires_at=CASE WHEN consumed_by IS NULL THEN expires_at ELSE continuation_expires_at END WHERE id=? AND (expires_at > ? OR continuation_expires_at > ?)",
        )
        .bind(
          time,
          operatorHash,
          identifier(quoteId, "quote identifier"),
          time,
          time,
        )
        .run();
      if (result.meta?.changes !== 1)
        throw new HostedError(404, "The quote is unavailable or expired.");
    },
    async revokeQuote(quoteId, operatorId) {
      const operatorHash = await ownerHash(operatorId);
      const result = await db
        .prepare(
          "UPDATE tb_hosted_quotes SET revoked_at=?,revoked_by_hash=? WHERE id=?",
        )
        .bind(now(), operatorHash, identifier(quoteId, "quote identifier"))
        .run();
      if (result.meta?.changes !== 1)
        throw new HostedError(404, "The quote is unavailable.");
    },
    budget,
    async initializeBudget(input, operatorId) {
      await ownerHash(operatorId);
      if (
        !Number.isSafeInteger(input.creditsUsed) ||
        !Number.isSafeInteger(input.creditsLimit) ||
        !Number.isSafeInteger(input.usdMicroUsed) ||
        !Number.isSafeInteger(input.usdMicroLimit) ||
        input.creditsUsed < 51 ||
        input.creditsLimit > 100 ||
        input.creditsUsed > input.creditsLimit ||
        input.usdMicroUsed < 111000 ||
        input.usdMicroLimit > 5000000 ||
        input.usdMicroUsed > input.usdMicroLimit
      )
        throw new HostedError(
          400,
          "Budget reconciliation must carry at least 51 credits and 111000 micro-USD within the global 100-credit/US$5 ceilings.",
        );
      await db
        .prepare(
          "INSERT INTO tb_hosted_budgets (id,credits_used,credits_limit,usd_micro_used,usd_micro_limit,initialized_at,initialized_by_hash) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          budgetId,
          input.creditsUsed,
          input.creditsLimit,
          input.usdMicroUsed,
          input.usdMicroLimit,
          now(),
          await ownerHash(operatorId),
        )
        .run();
      const current = await budget();
      if (
        JSON.stringify(current) !==
        JSON.stringify({
          creditsUsed: input.creditsUsed,
          creditsLimit: input.creditsLimit,
          usdMicroUsed: input.usdMicroUsed,
          usdMicroLimit: input.usdMicroLimit,
        })
      )
        throw new HostedError(
          409,
          "A different global spending ledger already exists; it cannot be reset.",
        );
      return current;
    },
    async listPendingQuotes() {
      const result = await db
        .prepare(
          "SELECT id,operation,credits,usd_micro,expires_at FROM tb_hosted_quotes WHERE consumed_by IS NULL AND expires_at > ? AND approved_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 50",
        )
        .bind(now())
        .all<
          Pick<
            QuoteRow,
            "id" | "operation" | "credits" | "usd_micro" | "expires_at"
          >
        >();
      return result.results.map(
        (row) =>
          ({
            id: row.id,
            operation: row.operation,
            credits: row.credits,
            usdMicro: row.usd_micro,
            expiresAt: row.expires_at,
          }) as PendingQuoteSummary,
      );
    },
    async cleanup() {
      const time = now();
      await db.batch([
        db
          .prepare("DELETE FROM tb_hosted_records WHERE expires_at <= ?")
          .bind(time),
        db
          .prepare(
            "DELETE FROM tb_hosted_quotes WHERE expires_at <= ? AND (continuation_expires_at IS NULL OR continuation_expires_at <= ?)",
          )
          .bind(time, time),
        db
          .prepare("DELETE FROM tb_hosted_rate_limits WHERE expires_at <= ?")
          .bind(time),
      ]);
    },
    async rateLimit(key, limit, windowMs) {
      if (
        typeof key !== "string" ||
        !key ||
        key.length > 1000 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 10000 ||
        !Number.isInteger(windowMs) ||
        windowMs < 1000 ||
        windowMs > 3600000
      )
        throw new HostedError(400, "Invalid rate-limit window.");
      const time = now(),
        start = Math.floor(time / windowMs) * windowMs;
      const result = await db
        .prepare(
          "INSERT INTO tb_hosted_rate_limits (key_hash,window_start,count,expires_at) VALUES (?,?,1,?) ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN tb_hosted_rate_limits.window_start=excluded.window_start THEN MIN(tb_hosted_rate_limits.count+1,?) ELSE 1 END,window_start=excluded.window_start,expires_at=excluded.expires_at RETURNING count",
        )
        .bind(
          await hashValue(["rate-v1", key, windowMs]),
          start,
          start + windowMs,
          limit + 1,
        )
        .first<{ count: number }>();
      return (result?.count ?? limit + 1) <= limit;
    },
  };
  return store;
}

/** Call only from an independently authenticated operator reconciliation action. */
export async function initializeBudget(
  env: HostedEnv,
  input: HostedBudget,
  operatorId: string,
  now: () => number = Date.now,
) {
  return createHostedStore(env, now).initializeBudget(input, operatorId);
}
