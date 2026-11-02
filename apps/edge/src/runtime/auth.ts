import { HostedError, type HostedEnv, type HostedSession } from "./contracts";
const cookieName = "__Host-tb_cloud";
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  [...bytes].map((v) => v.toString(16).padStart(2, "0")).join("");
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const base64url = (value: string) =>
  btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
function decode(value: string) {
  return atob(
    value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "="),
  );
}
async function key(secret: string) {
  if (encoder.encode(secret ?? "").length < 32)
    throw new HostedError(503, "Cloud session security is not configured.");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
async function signature(value: string, secret: string) {
  return hex(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await key(secret),
        encoder.encode(value),
      ),
    ),
  );
}
export function assertHostedOrigin(request: Request, env: HostedEnv) {
  let canonical: URL;
  try {
    canonical = new URL(env.SITE_ORIGIN);
  } catch {
    throw new HostedError(503, "The cloud origin is not configured.");
  }
  if (
    canonical.protocol !== "https:" ||
    canonical.origin !== env.SITE_ORIGIN ||
    new URL(request.url).origin !== canonical.origin
  )
    throw new HostedError(403, "Use the configured secure Site origin.");
  if (
    request.headers.has("origin") &&
    request.headers.get("origin") !== canonical.origin
  )
    throw new HostedError(403, "An exact same-origin request is required.");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== canonical.origin
  )
    throw new HostedError(403, "An exact same-origin request is required.");
}
/** Stateless signed cookie; it conveys ownership and CSRF, never paid permission. */
export async function hostedSession(
  request: Request,
  env: HostedEnv,
  now = Date.now(),
  createIfMissing = false,
): Promise<{ session: HostedSession | null; setCookie?: string }> {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (cookie && cookie.length < 1024) {
    try {
      const [payload, sig, ...extra] = cookie.split(".");
      if (extra.length || !sig || !/^[a-f0-9]{64}$/.test(sig))
        throw new Error("Invalid session");
      const raw = Uint8Array.from(sig.match(/../g)!, (v) => parseInt(v, 16));
      const valid = await crypto.subtle.verify(
        "HMAC",
        await key(env.EDGE_SESSION_SECRET),
        raw,
        encoder.encode(env.SITE_ORIGIN + "." + payload),
      );
      if (valid) {
        const v = JSON.parse(decode(payload));
        if (
          v.version === 1 &&
          /^[a-f0-9]{64}$/.test(v.id) &&
          /^[a-f0-9]{64}$/.test(v.csrfToken) &&
          Number.isFinite(v.expiresAt) &&
          v.expiresAt > now &&
          v.expiresAt <= now + 3600000
        )
          return {
            session: {
              id: v.id,
              csrfToken: v.csrfToken,
              expiresAt: v.expiresAt,
            },
          };
      }
    } catch {
      /* Invalid cookies do not establish identity or authorization. */
    }
  }
  if (new URL(request.url).pathname !== "/api/session" && !createIfMissing)
    return { session: null };
  const session: HostedSession = {
    id: random(),
    csrfToken: random(),
    expiresAt: now + 3600000,
  };
  const payload = base64url(JSON.stringify({ version: 1, ...session }));
  const sig = await signature(
    env.SITE_ORIGIN + "." + payload,
    env.EDGE_SESSION_SECRET,
  );
  return {
    session,
    setCookie: `${cookieName}=${payload}.${sig}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600`,
  };
}
export function assertHostedCsrf(request: Request, session: HostedSession) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("x-csrf-token") !== session.csrfToken
  )
    throw new HostedError(403, "Refresh the cloud session before continuing.");
}
async function constantMatch(candidate: string, expected: string) {
  if (!candidate || !expected || expected.length < 32 || candidate.length > 512)
    return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const av = new Uint8Array(a),
    bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}
export async function hostedOperator(
  request: Request,
  env: HostedEnv,
): Promise<{ operator: boolean; operatorId: string | null }> {
  // This service credential is for server-side operator tooling only. It never
  // appears in the browser bundle, local storage, URL, or client configuration.
  const supplied =
    request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] ?? "";
  if (await constantMatch(supplied, env.EDGE_OPERATOR_TOKEN ?? ""))
    return { operator: true, operatorId: "service-operator" };
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (
    env.SITES_IDENTITY_TRUSTED === "true" &&
    ((env.OPERATOR_SITE_USER_ID && id === env.OPERATOR_SITE_USER_ID) ||
      (env.OPERATOR_SITE_USER_EMAIL &&
        id &&
        email === env.OPERATOR_SITE_USER_EMAIL.trim().toLowerCase()))
  )
    return { operator: true, operatorId: "site-operator" };
  return { operator: false, operatorId: null };
}
