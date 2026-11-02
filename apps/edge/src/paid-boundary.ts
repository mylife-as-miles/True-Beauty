import { z } from "zod";

export interface D1Statement {
  bind(...values: Array<string | number | null>): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}
export interface EdgeD1 {
  prepare(query: string): D1Statement;
}
export interface EdgeEnvironment {
  DB: EdgeD1;
  SITE_ORIGIN: string;
  EDGE_SESSION_SECRET: string;
  OPERATOR_SITE_USER_ID: string;
  SITES_IDENTITY_TRUSTED?: string;
  EDGE_BUDGET_ID?: string;
}
type Operation = "reasoning" | "skin" | "hair" | "clothing";
interface Session {
  id: string;
  expires: number;
  csrf: string;
}
interface Reservation {
  reservation_id: string;
  voucher_hash: string;
  budget_id: string;
  session_hash: string;
  operation: Operation;
  quote_hash: string;
  usd_micro: number;
  credits: number;
  created_ms: number;
}
const COOKIE = "__Host-tb_edge",
  TOKEN = /^[a-f0-9]{64}$/;
const operation = z.enum(["reasoning", "skin", "hair", "clothing"]);
const units = {
  operation,
  quoteHash: z.string().regex(TOKEN),
  usdMicro: z.number().int().min(0).max(5000000),
  credits: z.number().int().min(0).max(100),
};
const voucherSchema = z
  .object({ ...units, targetSessionId: z.string().regex(TOKEN).optional() })
  .strict()
  .refine(
    (body) =>
      body.operation === "reasoning"
        ? body.usdMicro > 0 && body.credits === 0
        : body.usdMicro === 0 && body.credits > 0,
    "Select the exact relevant provider unit",
  );
const reservationSchema = z
  .object({
    ...units,
    reservationId: z.string().uuid(),
    voucher: z.string().regex(TOKEN),
    costAuthorized: z.literal(true),
    textTransmission: z.literal(true).optional(),
    uploadConsent: z.literal(true).optional(),
    providerRetentionConsent: z.literal(true),
  })
  .strict()
  .refine(
    (body) =>
      body.operation === "reasoning"
        ? body.textTransmission === true
        : body.uploadConsent === true,
    "Explicit transmission consent is required",
  );
class BoundaryError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
async function signingKey(secret: string) {
  if (new TextEncoder().encode(secret ?? "").length < 32)
    throw new BoundaryError(
      503,
      "The paid-operation boundary is not configured",
    );
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
async function sign(value: string, secret: string) {
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      await signingKey(secret),
      new TextEncoder().encode(value),
    ),
  );
}
async function verify(value: string, signature: string, secret: string) {
  if (!TOKEN.test(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/../g)!, (value) =>
    parseInt(value, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    await signingKey(secret),
    bytes,
    new TextEncoder().encode(value),
  );
}
function origin(request: Request, env: EdgeEnvironment) {
  let allowed: URL;
  try {
    allowed = new URL(env.SITE_ORIGIN);
  } catch {
    throw new BoundaryError(503, "The canonical Site origin is not configured");
  }
  if (
    allowed.protocol !== "https:" ||
    allowed.origin !== env.SITE_ORIGIN ||
    new URL(request.url).origin !== allowed.origin
  )
    throw new BoundaryError(403, "Use the canonical HTTPS Site");
  if (
    request.method !== "GET" &&
    request.headers.get("Origin") !== allowed.origin
  )
    throw new BoundaryError(403, "An exact same-origin request is required");
}
async function session(
  request: Request,
  env: EdgeEnvironment,
  now: number,
): Promise<Session> {
  const cookie = request.headers
      .get("Cookie")
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1),
    parts = cookie?.split(".");
  if (
    !parts ||
    parts.length !== 3 ||
    !TOKEN.test(parts[0]) ||
    !/^[0-9]{13}$/.test(parts[1]) ||
    Number(parts[1]) <= now ||
    !(await verify(
      parts[0] + "." + parts[1],
      parts[2],
      env.EDGE_SESSION_SECRET,
    ))
  )
    throw new BoundaryError(403, "Refresh the local Site session");
  const csrf = await sign(
    "csrf:" + parts[0] + "." + parts[1],
    env.EDGE_SESSION_SECRET,
  );
  if (request.method !== "GET" && request.headers.get("X-CSRF-Token") !== csrf)
    throw new BoundaryError(403, "A valid session CSRF capability is required");
  return { id: parts[0], expires: Number(parts[1]), csrf };
}
function operator(request: Request, env: EdgeEnvironment) {
  if (
    env.SITES_IDENTITY_TRUSTED !== "true" ||
    !env.OPERATOR_SITE_USER_ID ||
    request.headers.get("oai-authenticated-user-id") !==
      env.OPERATOR_SITE_USER_ID
  )
    throw new BoundaryError(
      403,
      "Paid-operation vouchers can only be issued by the authorized Site operator",
    );
}
async function body(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new BoundaryError(415, "Use a JSON metadata request");
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > 8192)
    throw new BoundaryError(413, "The metadata request is too large");
  const reader = request.body?.getReader();
  if (!reader) throw new BoundaryError(400, "A JSON metadata body is required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new BoundaryError(413, "The metadata request is too large");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BoundaryError(400, "The metadata JSON is malformed");
  }
}
async function storedReservation(env: EdgeEnvironment, id: string) {
  return env.DB.prepare(
    "SELECT * FROM tb_edge_reservations WHERE reservation_id = ?",
  )
    .bind(id)
    .first<Reservation>();
}
function matches(a: Reservation, b: Reservation) {
  return (
    a.reservation_id === b.reservation_id &&
    a.voucher_hash === b.voucher_hash &&
    a.budget_id === b.budget_id &&
    a.session_hash === b.session_hash &&
    a.operation === b.operation &&
    a.quote_hash === b.quote_hash &&
    a.usd_micro === b.usd_micro &&
    a.credits === b.credits
  );
}

/** Fetch-native prototype. It intentionally cannot dispatch a paid provider request. */
export async function handlePaidBoundary(
  request: Request,
  env: EdgeEnvironment,
  now = Date.now(),
): Promise<Response> {
  try {
    origin(request, env);
    const url = new URL(request.url),
      budgetId = env.EDGE_BUDGET_ID ?? "edge-r06-total";
    if (url.pathname === "/api/edge/health" && request.method === "GET")
      return json({
        prototype: true,
        providerDispatch: false,
        publicCore: "unchanged",
        globalBudget: {
          usd: 5,
          providerCredits: 100,
          reset: "no automatic reset",
        },
      });
    if (url.pathname === "/api/edge/session" && request.method === "GET") {
      let current: Session;
      try {
        current = await session(request, env, now);
      } catch {
        const id = random(),
          expires = now + 30 * 60000;
        current = {
          id,
          expires,
          csrf: await sign(
            "csrf:" + id + "." + expires,
            env.EDGE_SESSION_SECRET,
          ),
        };
      }
      const value = current.id + "." + current.expires,
        signature = await sign(value, env.EDGE_SESSION_SECRET);
      return json(
        {
          csrfToken: current.csrf,
          sessionId: current.id,
          expiresAt: new Date(current.expires).toISOString(),
          paidCapability: false,
        },
        200,
        {
          "Set-Cookie": `${COOKIE}=${value}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800`,
        },
      );
    }
    const current = await session(request, env, now),
      sessionHash = await hash(current.id);
    if (
      url.pathname === "/api/edge/operator/vouchers" &&
      request.method === "POST"
    ) {
      operator(request, env);
      const parsed = voucherSchema.safeParse(await body(request));
      if (!parsed.success)
        throw new BoundaryError(
          400,
          "An exact quote hash, operation and bounded provider amount are required",
        );
      const value = parsed.data,
        token = random(),
        expires = now + 5 * 60000;
      await env.DB.prepare(
        "INSERT INTO tb_edge_vouchers (token_hash,budget_id,session_hash,operation,quote_hash,usd_micro,credits,issued_ms,expires_ms) VALUES (?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          await hash(token),
          budgetId,
          await hash(value.targetSessionId ?? current.id),
          value.operation,
          value.quoteHash,
          value.usdMicro,
          value.credits,
          now,
          expires,
        )
        .run();
      return json({
        voucher: token,
        expiresAt: new Date(expires).toISOString(),
        operation: value.operation,
        usdMicro: value.usdMicro,
        credits: value.credits,
        note: "One use, exact quote and session only. Keep this runtime capability out of URLs and persistent browser storage.",
      });
    }
    if (
      url.pathname === "/api/edge/reservations" &&
      request.method === "POST"
    ) {
      const parsed = reservationSchema.safeParse(await body(request));
      if (!parsed.success)
        throw new BoundaryError(
          400,
          "The exact voucher, quote, amount and explicit per-request consent are required",
        );
      const value = parsed.data,
        reservation: Reservation = {
          reservation_id: value.reservationId,
          voucher_hash: await hash(value.voucher),
          budget_id: budgetId,
          session_hash: sessionHash,
          operation: value.operation,
          quote_hash: value.quoteHash,
          usd_micro: value.usdMicro,
          credits: value.credits,
          created_ms: now,
        };
      const existing = await storedReservation(env, reservation.reservation_id);
      if (existing) {
        if (!matches(existing, reservation))
          throw new BoundaryError(
            409,
            "This reservation identifier already belongs to a different request",
          );
        return json({
          reservationId: existing.reservation_id,
          reused: true,
          providerDispatch: false,
          usdMicro: existing.usd_micro,
          credits: existing.credits,
        });
      }
      try {
        await env.DB.prepare(
          "INSERT INTO tb_edge_reservations (reservation_id,voucher_hash,budget_id,session_hash,operation,quote_hash,usd_micro,credits,created_ms) VALUES (?,?,?,?,?,?,?,?,?)",
        )
          .bind(
            reservation.reservation_id,
            reservation.voucher_hash,
            budgetId,
            sessionHash,
            reservation.operation,
            reservation.quote_hash,
            reservation.usd_micro,
            reservation.credits,
            now,
          )
          .run();
      } catch (error) {
        const prior = await storedReservation(env, reservation.reservation_id);
        if (prior && matches(prior, reservation))
          return json({
            reservationId: prior.reservation_id,
            reused: true,
            providerDispatch: false,
            usdMicro: prior.usd_micro,
            credits: prior.credits,
          });
        if (String(error).includes("edge_budget_exceeded"))
          throw new BoundaryError(
            402,
            "The shared operator spending ceiling has been reached",
          );
        throw new BoundaryError(
          403,
          "The voucher is invalid, expired, already consumed or belongs to another request",
        );
      }
      return json({
        reservationId: reservation.reservation_id,
        reused: false,
        providerDispatch: false,
        usdMicro: reservation.usd_micro,
        credits: reservation.credits,
        note: "Prototype reservation only. No provider API was called and no photograph or prompt was stored.",
      });
    }
    if (
      url.pathname.startsWith("/api/edge/reservations/") &&
      request.method === "GET"
    ) {
      const record = await storedReservation(
        env,
        url.pathname.split("/").at(-1)!,
      );
      if (!record || record.session_hash !== sessionHash)
        throw new BoundaryError(404, "Reservation not found");
      return json({
        reservationId: record.reservation_id,
        operation: record.operation,
        usdMicro: record.usd_micro,
        credits: record.credits,
        providerDispatch: false,
      });
    }
    return json({ error: "This prototype route does not exist" }, 404);
  } catch (error) {
    return error instanceof BoundaryError
      ? json({ error: error.message }, error.status)
      : json(
          {
            error: "The paid-operation boundary could not verify this request",
          },
          503,
        );
  }
}
