/** Shared native-Worker contracts. Personal profiles remain in browser Dexie. */
export type PaidOperation = "skin" | "hair" | "clothing" | "reasoning";
export interface D1Result {
  success: boolean;
  meta?: { changes?: number };
  results?: unknown[];
}
export interface D1Statement {
  bind(...values: Array<string | number | null>): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<D1Result>;
}
export interface HostedD1 {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}
export interface HostedEnv {
  DB: HostedD1;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  SITE_ORIGIN: string;
  EDGE_SESSION_SECRET: string;
  EDGE_DATA_SECRET: string;
  EDGE_OPERATOR_TOKEN?: string;
  OPERATOR_SITE_USER_ID?: string;
  OPERATOR_SITE_USER_EMAIL?: string;
  SITES_IDENTITY_TRUSTED?: string;
  YOUCAM_API_KEY?: string;
  YOUCAM_ENABLE_PAID?: string;
  YOUCAM_SKIN_PLAN_JSON?: string;
  YOUCAM_GENERATION_PLANS_JSON?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  TB_REASONING_PROVIDER?: string;
  TB_REASONING_MODEL?: string;
  TB_REASONING_ENDPOINT?: string;
  TB_REASONING_PRICING_JSON?: string;
  TB_REASONING_ENABLE_PAID?: string;
  TB_REASONING_MAX_REQUEST_USD?: string;
  EDGE_BUDGET_ID?: string;
  EDGE_CREDIT_LIMIT?: string;
  EDGE_USD_MICRO_LIMIT?: string;
}
export interface StoredRecord<T = unknown> {
  namespace: string;
  id: string;
  owner: string;
  revision: number;
  expiresAt: number;
  value: T;
}
export interface RecordInput<T = unknown> {
  namespace: string;
  id: string;
  owner: string;
  expiresAt: number;
  value: T;
}
export interface StoredQuote<T = unknown> {
  id: string;
  owner: string;
  operation: PaidOperation;
  termsHash: string;
  credits: number;
  usdMicro: number;
  expiresAt: number;
  consumedBy: string | null;
  value: T;
}
export type QuoteInput<T = unknown> = Omit<StoredQuote<T>, "consumedBy">;
export interface ConsumeQuoteInput<T = unknown> {
  quoteId: string;
  owner: string;
  operator: boolean;
  operation: PaidOperation;
  termsHash: string;
  record: Omit<RecordInput<T>, "owner">;
}
export interface ReservationReceipt {
  id: string;
  quoteId: string;
  operation: PaidOperation;
  credits: number;
  usdMicro: number;
  createdAt: number;
}
export interface HostedBudget {
  creditsUsed: number;
  creditsLimit: number;
  usdMicroUsed: number;
  usdMicroLimit: number;
}
export interface PendingQuoteSummary {
  id: string;
  operation: PaidOperation;
  credits: number;
  usdMicro: number;
  expiresAt: number;
}
export interface HostedStore {
  get<T>(
    namespace: string,
    id: string,
    owner: string,
  ): Promise<StoredRecord<T> | null>;
  insert<T>(record: RecordInput<T>): Promise<StoredRecord<T>>;
  compareAndSwap<T>(
    record: RecordInput<T> & { revision: number },
  ): Promise<StoredRecord<T> | null>;
  delete(namespace: string, id: string, owner: string): Promise<boolean>;
  list<T>(
    namespace: string,
    owner: string,
    limit?: number,
  ): Promise<StoredRecord<T>[]>;
  createQuote<T>(quote: QuoteInput<T>): Promise<StoredQuote<T>>;
  getQuote<T>(id: string, owner: string): Promise<StoredQuote<T> | null>;
  consumeQuoteAndCreate<T>(input: ConsumeQuoteInput<T>): Promise<{
    record: StoredRecord<T>;
    reservation: ReservationReceipt;
    created: boolean;
  }>;
  assertContinuation(
    quoteId: string,
    owner: string,
    operator: boolean,
  ): Promise<void>;
  quoteAccess(
    quoteId: string,
    owner: string,
    operator: boolean,
  ): Promise<{ approved: boolean; reason: string }>;
  approveQuote(quoteId: string, operatorId: string): Promise<void>;
  revokeQuote(quoteId: string, operatorId: string): Promise<void>;
  budget(): Promise<HostedBudget>;
  initializeBudget(
    input: HostedBudget,
    operatorId: string,
  ): Promise<HostedBudget>;
  listPendingQuotes(): Promise<PendingQuoteSummary[]>;
  cleanup(): Promise<void>;
  rateLimit(key: string, limit: number, windowMs: number): Promise<boolean>;
}
export interface HostedSession {
  id: string;
  csrfToken: string;
  expiresAt: number;
}
export interface HostedContext {
  env: HostedEnv;
  store: HostedStore;
  session: HostedSession;
  operator: boolean;
  operatorId: string | null;
  now: () => number;
  waitUntil: (promise: Promise<unknown>) => void;
}
export type HostedRoute = (
  request: Request,
  context: HostedContext,
) => Promise<Response | null>;
export class HostedError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
}
export async function hashValue(value: unknown): Promise<string> {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
          )
        : v;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical(value))),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
/** Bounded request decoding, before JSON parsing allocates a second body copy. */
export async function readJson(
  request: Request,
  maximum = 128 * 1024,
): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HostedError(415, "Use an application/json request.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maximum) throw new HostedError(413, "The request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HostedError(400, "A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > maximum) {
      await reader.cancel();
      throw new HostedError(413, "The request is too large.");
    }
    chunks.push(r.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HostedError(400, "Malformed JSON request.");
  } finally {
    bytes.fill(0);
  }
}
