import type { FastifyInstance } from "fastify";
import * as http from "node:http";
import { z } from "zod";
import {
  MERCHANT_SOURCES,
  allowedReferenceUrl,
  parseMerchantHtml,
  unavailableObservation,
  type MerchantSource,
  type MerchantReference,
  type MerchantRefreshResult,
} from "../../../packages/commerce-engine/src/merchant";
export interface MerchantRouteOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  sources?: MerchantSource[];
  cacheMs?: number;
}
const USER_AGENT =
  "TrueBeautyReference/0.1 (user-initiated public product fact lookup)";
const MAX_BYTES = 2500000;
/** Minimal robots matching for the actual fixed product paths; most-specific applicable agent and path rule wins. */
export function robotsAllows(
  text: string,
  path: string,
  agent = "TrueBeautyReference",
): boolean {
  const groups: Array<{
    agents: string[];
    rules: Array<{ allow: boolean; path: string }>;
  }> = [];
  let group = {
    agents: [] as string[],
    rules: [] as Array<{ allow: boolean; path: string }>,
  };
  let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase(),
      value = match[2].trim();
    if (key === "user-agent") {
      if (hasRules) {
        groups.push(group);
        group = { agents: [], rules: [] };
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && group.agents.length) {
      hasRules = true;
      if (value) group.rules.push({ allow: key === "allow", path: value });
    }
  }
  if (group.agents.length) groups.push(group);
  const id = agent.toLowerCase();
  const matches = groups.flatMap((g) =>
    g.agents
      .filter((a) => a === "*" || id.includes(a))
      .map((a) => ({ group: g, weight: a === "*" ? 0 : a.length })),
  );
  if (!matches.length) return true;
  const best = Math.max(...matches.map((m) => m.weight));
  const rules = matches
    .filter((m) => m.weight === best)
    .flatMap((m) => m.group.rules)
    .filter((rule) => {
      const escaped = rule.path
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\\\$$/, "$");
      try {
        return new RegExp("^" + escaped).test(path);
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        b.path.replace(/\*/g, "").length - a.path.replace(/\*/g, "").length ||
        Number(b.allow) - Number(a.allow),
    );
  return rules[0]?.allow ?? true;
}
async function boundedText(
  response: Response,
  limit = MAX_BYTES,
): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) {
    await response.body?.cancel();
    throw new Error("Page exceeds size limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("Page exceeds size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(joined);
}
export function registerMerchantRoutes(
  app: FastifyInstance,
  options: MerchantRouteOptions = {},
) {
  if (
    !options.fetcher &&
    typeof http.setGlobalProxyFromEnv === "function" &&
    (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  )
    http.setGlobalProxyFromEnv();
  const fetcher = options.fetcher ?? fetch,
    now = options.now ?? Date.now,
    sources = options.sources ?? MERCHANT_SOURCES,
    cacheMs = options.cacheMs ?? 15 * 60000;
  const cache = new Map<
      string,
      { result: MerchantRefreshResult; expires: number }
    >(),
    pending = new Map<string, Promise<MerchantRefreshResult>>(),
    robots = new Map<string, { allowedText: string; expires: number }>(),
    limits = new Map<string, { at: number; count: number }>();
  async function get(url: string, limit = MAX_BYTES) {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html, text/plain;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error(
        "The official source redirected; its new URL requires review",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Official source returned HTTP ${response.status}`);
    }
    const type = response.headers.get("content-type") ?? "";
    if (type && !/text\/(?:html|plain)|application\/xhtml\+xml/i.test(type)) {
      await response.body?.cancel();
      throw new Error("The official source returned an unsupported document");
    }
    return boundedText(response, limit);
  }
  async function refresh(
    source: MerchantSource,
    reference: MerchantReference,
  ): Promise<MerchantRefreshResult> {
    const key = source.id + ":" + reference.id;
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return { ...hit.result, cached: true };
    const active = pending.get(key);
    if (active) return active;
    const task = (async () => {
      let fetchedAt = new Date(now()).toISOString();
      let observations: MerchantRefreshResult["observations"];
      try {
        let policy = robots.get(source.id);
        if (!policy || policy.expires < now()) {
          const text = await get(source.origin + "/robots.txt", 100000);
          policy = { allowedText: text, expires: now() + 3600000 };
          robots.set(source.id, policy);
        }
        if (!robotsAllows(policy.allowedText, new URL(reference.url).pathname))
          throw new Error(
            "The official source robots policy does not permit this product lookup",
          );
        const html = await get(reference.url);
        fetchedAt = new Date(now()).toISOString();
        observations = parseMerchantHtml(html, source, reference, fetchedAt);
      } catch (error) {
        fetchedAt = new Date(now()).toISOString();
        observations = [
          unavailableObservation(
            source,
            reference,
            fetchedAt,
            error instanceof Error
              ? error.message
              : "The official source could not be reached. No price or stock was inferred.",
          ),
        ];
      }
      const expires =
        now() +
        (observations.some((o) => o.status === "observed") ? cacheMs : 60000);
      const result = {
        sourceId: source.id,
        referenceId: reference.id,
        fetchedAt,
        observations,
        cached: false,
        nextRefreshAt: new Date(expires).toISOString(),
      };
      cache.set(key, { result, expires });
      return result;
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  }
  app.get("/api/merchants/sources", async () => ({
    sources,
    refreshPolicy:
      "Only the listed public product pages can be requested. Fifteen-minute successful-observation cache; one-minute failure cache. No checkout, account or personal-data requests.",
    partnership: false,
  }));
  const requestSchema = z
    .object({ sourceId: z.string().max(80), referenceId: z.string().max(100) })
    .strict();
  app.post("/api/merchants/refresh", async (req, reply) => {
    const data = requestSchema.safeParse(req.body);
    if (!data.success)
      return reply.code(400).send({
        error:
          "Choose a supported merchant product. URLs and extra fields are not accepted here.",
      });
    const source = sources.find(
        (s) => s.id === data.data.sourceId && s.enabled,
      ),
      reference = source?.references.find(
        (r) => r.id === data.data.referenceId,
      );
    if (!source || !reference || !allowedReferenceUrl(reference.url, sources))
      return reply.code(400).send({
        error: "This merchant product is not on the reviewed source list.",
      });
    const previous = limits.get(req.ip),
      rate =
        previous && now() - previous.at < 60000
          ? previous
          : { at: now(), count: 0 };
    rate.count++;
    limits.set(req.ip, rate);
    if (limits.size > 1000)
      for (const [ip, item] of limits)
        if (now() - item.at >= 60000) limits.delete(ip);
    if (rate.count > 12)
      return reply.header("Retry-After", "60").code(429).send({
        error: "Please wait a minute before requesting more source checks.",
      });
    return refresh(source, reference);
  });
  app.post("/api/merchants/resolve", async (req, reply) => {
    const parsed = z
      .object({ url: z.string().url().max(1000) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "Use an exact supported HTTPS product link." });
    const reference = allowedReferenceUrl(parsed.data.url, sources);
    return reference
      ? { sourceId: reference.sourceId, referenceId: reference.id }
      : reply.code(400).send({
          error:
            "Only the exact listed official product URLs are supported. No request was sent to that URL.",
        });
  });
}
