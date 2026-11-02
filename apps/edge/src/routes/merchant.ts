/** Native Worker public-source lookup. No Node, Dexie, images or paid services. */
import { z } from "zod";
import {
  MERCHANT_SOURCES,
  allowedReferenceUrl,
  unavailableObservation,
  type MerchantSource,
  type MerchantReference,
  type MerchantRefreshResult,
} from "../../../../packages/commerce-engine/src/merchant";
import {
  getMerchantDocument,
  readMerchantReference,
} from "../../../api/src/merchantProvider";
import { assertHostedCsrf, assertHostedOrigin } from "../runtime/auth";
import {
  HostedError,
  json,
  readJson,
  type HostedContext,
  type StoredRecord,
} from "../runtime/contracts";

const owner = "public-merchant-v1";
const maximumTtl = 15 * 60000;
const leaseMs = 45000;
const selectionSchema = z.strictObject({
  sourceId: z.string().max(80),
  referenceId: z.string().max(100),
});
const resolveSchema = z.strictObject({ url: z.string().url().max(1000) });
interface CacheValue<T> {
  startedAt: number;
  leaseUntil?: number;
  value?: T;
}

/** One D1 CAS lease per public key. An isolate failure expires, never unlocks a successor's lease. */
async function sharedLoad<T>(
  namespace: string,
  id: string,
  ctx: HostedContext,
  loader: (startedAt: number) => Promise<{ value: T; expiresAt: number }>,
): Promise<{ value: T; cached: boolean }> {
  let lease: StoredRecord<CacheValue<T>> | null = null;
  for (let attempt = 0; attempt < 4 && !lease; attempt++) {
    const current = await ctx.store.get<CacheValue<T>>(namespace, id, owner);
    if (current?.value.value !== undefined)
      return { value: current.value.value, cached: true };
    if (current?.value.leaseUntil && current.value.leaseUntil > ctx.now())
      throw new HostedError(
        409,
        "Another source check is in progress. Try again shortly.",
      );
    const startedAt = current?.value.startedAt ?? ctx.now();
    const input = {
      namespace,
      id,
      owner,
      expiresAt: Math.min(startedAt + maximumTtl, ctx.now() + leaseMs),
      value: { startedAt, leaseUntil: ctx.now() + leaseMs },
    };
    if (current)
      lease = await ctx.store.compareAndSwap({
        ...input,
        revision: current.revision,
      });
    else {
      try {
        lease = await ctx.store.insert(input);
      } catch (error) {
        if (!(error instanceof HostedError) || error.status !== 409)
          throw error;
      }
    }
  }
  if (!lease)
    throw new HostedError(
      409,
      "Another source check acquired this reference. Try again shortly.",
    );
  let result: { value: T; expiresAt: number };
  try {
    result = await loader(lease.value.startedAt);
  } catch (error) {
    // Release a known failure only at our revision. A crashed isolate instead
    // leaves its bounded lease to expire; it cannot unlock a successor.
    await ctx.store
      .compareAndSwap({
        namespace,
        id,
        owner,
        revision: lease.revision,
        expiresAt: Math.min(
          lease.value.startedAt + maximumTtl,
          ctx.now() + 1000,
        ),
        value: { startedAt: lease.value.startedAt },
      })
      .catch(() => null);
    throw error;
  }
  const committed = await ctx.store.compareAndSwap({
    namespace,
    id,
    owner,
    revision: lease.revision,
    expiresAt: Math.min(result.expiresAt, lease.value.startedAt + maximumTtl),
    value: { startedAt: lease.value.startedAt, value: result.value },
  });
  if (!committed)
    throw new HostedError(
      409,
      "This source check expired before it could be recorded. Please retry.",
    );
  return { value: result.value, cached: false };
}

/** Injectable native transport is for local fixtures only; the mounted route uses global fetch. */
export function createMerchantHandler(
  options: { fetcher?: typeof fetch } = {},
) {
  const pending = new Map<string, Promise<MerchantRefreshResult>>();
  async function refresh(
    source: MerchantSource,
    reference: MerchantReference,
    ctx: HostedContext,
  ): Promise<MerchantRefreshResult> {
    const key = `${source.id}:${reference.id}`,
      flightKey = `${ctx.env.SITE_ORIGIN}:${key}`;
    const existing = pending.get(flightKey);
    if (existing) return existing;
    const task = (async () => {
      const loaded = await sharedLoad(
        "merchant-observation",
        key,
        ctx,
        async (startedAt) => {
          let fetchedAt = new Date(ctx.now()).toISOString();
          let observations: MerchantRefreshResult["observations"];
          try {
            const policy = await sharedLoad<{
              text: string;
              error: string | null;
            }>("merchant-robots", source.id, ctx, async (started) => {
              try {
                return {
                  value: {
                    text: await getMerchantDocument(
                      source.origin + "/robots.txt",
                      { fetcher: options.fetcher, limit: 100000 },
                    ),
                    error: null,
                  },
                  expiresAt: started + maximumTtl,
                };
              } catch (error) {
                return {
                  value: {
                    text: "",
                    error:
                      error instanceof Error
                        ? error.message
                        : "The source robots policy could not be reached.",
                  },
                  expiresAt: Math.min(started + maximumTtl, ctx.now() + 60000),
                };
              }
            });
            if (policy.value.error) throw new Error(policy.value.error);
            const result = await readMerchantReference(source, reference, {
              robotsText: policy.value.text,
              fetcher: options.fetcher,
              now: ctx.now,
            });
            fetchedAt = result.fetchedAt;
            observations = result.observations;
          } catch (error) {
            if (error instanceof HostedError) throw error;
            fetchedAt = new Date(ctx.now()).toISOString();
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
          const expiresAt = Math.min(
            startedAt + maximumTtl,
            ctx.now() +
              (observations.some((o) => o.status === "observed")
                ? maximumTtl
                : 60000),
          );
          return {
            expiresAt,
            value: {
              sourceId: source.id,
              referenceId: reference.id,
              fetchedAt,
              observations,
              cached: false,
              nextRefreshAt: new Date(expiresAt).toISOString(),
            },
          };
        },
      );
      return { ...loaded.value, cached: loaded.cached };
    })();
    pending.set(flightKey, task);
    ctx.waitUntil(
      task.then(
        () => undefined,
        () => undefined,
      ),
    );
    try {
      return await task;
    } finally {
      if (pending.get(flightKey) === task) pending.delete(flightKey);
    }
  }
  return async function handleMerchant(
    request: Request,
    ctx: HostedContext,
  ): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/merchants/")) return null;
    assertHostedOrigin(request, ctx.env);
    if (path === "/api/merchants/sources" && request.method === "GET")
      return json({
        sources: MERCHANT_SOURCES,
        refreshPolicy:
          "Only the listed public product pages can be requested. Up to fifteen-minute successful-observation cache; one-minute failure cache. No checkout, account or personal-data requests.",
        partnership: false,
      });
    if (!["/api/merchants/refresh", "/api/merchants/resolve"].includes(path))
      return json({ error: "Unknown merchant endpoint." }, 404);
    if (request.method !== "POST")
      return json({ error: "Use POST for this merchant action." }, 405, {
        Allow: "POST",
      });
    if (!ctx.session?.id || ctx.session.expiresAt <= ctx.now())
      throw new HostedError(
        401,
        "Refresh the cloud session before continuing.",
      );
    assertHostedCsrf(request, ctx.session);
    if (!(await ctx.store.rateLimit(`merchant:${ctx.session.id}`, 12, 60000)))
      return json(
        { error: "Please wait a minute before requesting more source checks." },
        429,
        { "Retry-After": "60" },
      );
    const body = await readJson(request, 4096);
    if (path.endsWith("/resolve")) {
      const parsed = resolveSchema.safeParse(body);
      if (!parsed.success)
        return json(
          { error: "Use an exact supported HTTPS product link." },
          400,
        );
      const reference = allowedReferenceUrl(parsed.data.url);
      return reference
        ? json({ sourceId: reference.sourceId, referenceId: reference.id })
        : json(
            {
              error:
                "Only the exact listed official product URLs are supported. No request was sent to that URL.",
            },
            400,
          );
    }
    const parsed = selectionSchema.safeParse(body);
    if (!parsed.success)
      return json(
        {
          error:
            "Choose a supported merchant product. URLs and extra fields are not accepted here.",
        },
        400,
      );
    const source = MERCHANT_SOURCES.find(
        (s) => s.id === parsed.data.sourceId && s.enabled,
      ),
      reference = source?.references.find(
        (r) => r.id === parsed.data.referenceId,
      );
    if (!source || !reference || !allowedReferenceUrl(reference.url))
      return json(
        { error: "This merchant product is not on the reviewed source list." },
        400,
      );
    try {
      return json(await refresh(source, reference, ctx));
    } catch (error) {
      if (error instanceof HostedError && error.status === 409)
        return json({ error: error.message }, 409, { "Retry-After": "3" });
      throw error;
    }
  };
}
export const handleMerchant = createMerchantHandler();
