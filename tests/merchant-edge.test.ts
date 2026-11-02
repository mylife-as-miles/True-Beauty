import { describe, it, expect, vi } from "vitest";
import { createMerchantHandler } from "../apps/edge/src/routes/merchant";
import {
  HostedError,
  json,
  type HostedContext,
  type HostedEnv,
} from "../apps/edge/src/runtime/contracts";
import { MerchantStoreFixture } from "../apps/edge/experiments/merchant-store-fixture";
import { MERCHANT_SOURCES } from "../packages/commerce-engine/src/merchant";
const source = MERCHANT_SOURCES[0],
  reference = source.references[0];
const origin = "https://true-beauty.example";
const payload = { sourceId: source.id, referenceId: reference.id };
const schema =
  '<script type="application/ld+json">' +
  JSON.stringify({
    "@type": "Product",
    name: reference.title,
    url: reference.url,
    offers: {
      "@type": "Offer",
      sku: "FIXTURE-NOT-LIVE",
      price: "12500",
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
    },
  }) +
  "</script>";
function fixture(
  store = new MerchantStoreFixture(),
  sessionId = "fixture-session",
) {
  const context: HostedContext = {
    env: { SITE_ORIGIN: origin } as HostedEnv,
    store: store.asStore(),
    session: {
      id: sessionId,
      csrfToken: "fixture-csrf",
      expiresAt: store.clock + 3600000,
    },
    operator: false,
    operatorId: null,
    now: () => store.clock,
    waitUntil: () => {},
  };
  return { store, context };
}
function req(
  path = "/api/merchants/refresh",
  value: unknown = payload,
  headers: Record<string, string> = {},
) {
  return new Request(origin + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-csrf-token": "fixture-csrf",
      ...headers,
    },
    body: JSON.stringify(value),
  });
}
async function response(
  handler: ReturnType<typeof createMerchantHandler>,
  request: Request,
  ctx: HostedContext,
) {
  try {
    return await handler(request, ctx);
  } catch (error) {
    if (error instanceof HostedError)
      return json({ error: error.message }, error.status);
    throw error;
  }
}
const transport = () =>
  vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (url) =>
        new Response(
          String(url).endsWith("/robots.txt")
            ? "User-agent: *\nAllow: /"
            : schema,
          { headers: { "content-type": "text/html" } },
        ),
    );
describe("native merchant route — local fixtures, not live merchant or D1 verification", () => {
  it("offers the fixed registry without an account or outbound request and rejects unknown methods", async () => {
    const { context } = fixture(),
      fetcher = transport(),
      handler = createMerchantHandler({ fetcher });
    context.session.expiresAt = 0;
    const result = await handler(
      new Request(origin + "/api/merchants/sources"),
      context,
    );
    expect(await result!.json()).toMatchObject({
      sources: MERCHANT_SOURCES,
      partnership: false,
    });
    expect(
      (await handler(new Request(origin + "/api/merchants/refresh"), context))!
        .status,
    ).toBe(405);
    expect(
      await handler(new Request(origin + "/api/unrelated"), context),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("enforces same-origin, a live session, CSRF, bounded shape and exact source URLs before fetch", async () => {
    const { context } = fixture(),
      fetcher = transport(),
      handler = createMerchantHandler({ fetcher });
    expect(
      (await response(
        handler,
        req(undefined, undefined, { origin: "https://evil.example" }),
        context,
      ))!.status,
    ).toBe(403);
    expect(
      (await response(
        handler,
        req(undefined, undefined, { "x-csrf-token": "wrong" }),
        context,
      ))!.status,
    ).toBe(403);
    expect(
      (await response(handler, req(undefined, undefined), {
        ...context,
        session: { ...context.session, expiresAt: 0 },
      }))!.status,
    ).toBe(401);
    for (const value of [
      { ...payload, url: "http://169.254.169.254/" },
      { sourceId: "unknown", referenceId: reference.id },
      { url: reference.url },
    ])
      expect((await handler(req(undefined, value), context))!.status).toBe(400);
    for (const url of [
      "http://127.0.0.1/private",
      reference.url + "?x=1",
      "https://nubanbeauty.com@127.0.0.1/products/private",
    ])
      expect(
        (await handler(req("/api/merchants/resolve", { url }), context))!
          .status,
      ).toBe(400);
    expect(
      await (await handler(
        req("/api/merchants/resolve", { url: reference.url }),
        context,
      ))!.json(),
    ).toEqual(payload);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses shared cache across independent handlers and sessions with unchanged provenance/fetch timestamp", async () => {
    const { store, context } = fixture(),
      fetcher = transport();
    const first = await (await createMerchantHandler({ fetcher })(
      req(),
      context,
    ))!.json();
    store.clock += 1000;
    const second = await (await createMerchantHandler({ fetcher })(
      req(),
      fixture(store, "second-session").context,
    ))!.json();
    expect(first.observations[0]).toMatchObject({
      amount: 12500,
      currency: "NGN",
      availability: "in-stock",
      variantId: "FIXTURE-NOT-LIVE",
      sourceUrl: reference.url,
    });
    expect(second).toMatchObject({ ...first, cached: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(
        ([, init]) =>
          init?.credentials === "omit" && init.redirect === "manual",
      ),
    ).toBe(true);
    const cache = [...store.records.values()].find(
      (r) => r.namespace === "merchant-observation",
    )!;
    expect(cache.expiresAt).toBe(Date.parse(first.fetchedAt) + 900000);
  });
  it("CAS deduplicates simultaneous checks across independent handlers and coalesces within one handler", async () => {
    const { context } = fixture();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      ready = new Promise<void>((r) => (entered = r));
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith("/robots.txt")) {
        entered();
        await gate;
        return new Response("User-agent: *\nAllow: /");
      }
      return new Response(schema);
    });
    const a = createMerchantHandler({ fetcher }),
      b = createMerchantHandler({ fetcher });
    const first = a(req(), context);
    await ready;
    const same = a(req(), context);
    const contested = await b(req(), context);
    expect(contested!.status).toBe(409);
    expect(contested!.headers.get("retry-after")).toBe("3");
    release();
    expect((await first)!.status).toBe(200);
    expect((await same)!.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails closed on robots, redirects, bad MIME, declared/streamed over-limit bodies and missing offer fields", async () => {
    for (const mode of [
      "robots",
      "redirect",
      "mime",
      "declared",
      "stream",
      "missing",
    ]) {
      const { context } = fixture();
      let cancelled = false;
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
        if (String(url).endsWith("/robots.txt"))
          return new Response(
            mode === "robots"
              ? "User-agent: *\nDisallow: /"
              : "User-agent: *\nAllow: /",
          );
        if (mode === "redirect")
          return new Response("", {
            status: 302,
            headers: { location: "http://127.0.0.1/private" },
          });
        if (mode === "mime")
          return new Response("bad", {
            headers: { "content-type": "application/octet-stream" },
          });
        if (mode === "declared")
          return new Response("bad", {
            headers: { "content-length": "2500001" },
          });
        if (mode === "stream")
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(2500001));
              },
              cancel() {
                cancelled = true;
              },
            }),
          );
        return new Response(
          '<script type="application/ld+json">' +
            JSON.stringify({
              "@type": "Product",
              url: reference.url,
              name: reference.title,
              offers: { "@type": "Offer", sku: "EMPTY" },
            }) +
            "</script>",
        );
      });
      const result = await (await createMerchantHandler({ fetcher })(
        req(),
        context,
      ))!.json();
      expect(
        result.observations.every(
          (o: { amount?: number; availability: string }) =>
            o.amount === undefined && o.availability === "unknown",
        ),
      ).toBe(true);
      if (mode === "robots") expect(fetcher).toHaveBeenCalledTimes(1);
      if (mode === "stream") expect(cancelled).toBe(true);
    }
  });
  it("releases a contended reference lease after another reference finishes the shared robots check", async () => {
    const { context } = fixture();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      ready = new Promise<void>((r) => (entered = r));
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith("/robots.txt")) {
        entered();
        await gate;
        return new Response("User-agent: *\nAllow: /");
      }
      return new Response(schema.replaceAll(reference.url, String(url)));
    });
    const a = createMerchantHandler({ fetcher }),
      b = createMerchantHandler({ fetcher });
    const first = a(req(), context);
    await ready;
    const next = { sourceId: source.id, referenceId: source.references[1].id };
    expect((await b(req(undefined, next), context))!.status).toBe(409);
    release();
    await first;
    expect((await b(req(undefined, next), context))!.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("shares a one-minute robots failure without fetching a product or falsely claiming a check remains active", async () => {
    const { context } = fixture(),
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("Unavailable", { status: 503 })),
      handler = createMerchantHandler({ fetcher });
    const first = await (await handler(req(), context))!.json();
    const other = await (await handler(
      req(undefined, {
        sourceId: source.id,
        referenceId: source.references[1].id,
      }),
      context,
    ))!.json();
    expect(first.observations[0].status).toBe("unavailable");
    expect(other.observations[0].status).toBe("unavailable");
    expect(Date.parse(other.nextRefreshAt) - context.now()).toBe(60000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retries unavailable sources after one minute and retains bounded shared robots policy", async () => {
    const { store, context } = fixture();
    let failed = true;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).endsWith("/robots.txt")
          ? new Response("User-agent: *\nAllow: /")
          : failed
            ? new Response("Unavailable", { status: 503 })
            : new Response(schema),
      );
    const handler = createMerchantHandler({ fetcher });
    const first = await (await handler(req(), context))!.json();
    expect(Date.parse(first.nextRefreshAt) - store.clock).toBe(60000);
    expect(first.observations[0].status).toBe("unavailable");
    store.clock += 61000;
    failed = false;
    expect(
      (await (await handler(req(), context))!.json()).observations[0].amount,
    ).toBe(12500);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("limits both resolve and refresh actions per anonymous registered session without requiring paid authorization", async () => {
    const { context } = fixture(),
      fetcher = transport(),
      handler = createMerchantHandler({ fetcher });
    for (let i = 0; i < 12; i++)
      expect(
        (await handler(
          req("/api/merchants/resolve", { url: reference.url }),
          context,
        ))!.status,
      ).toBe(200);
    const blocked = await handler(req(), context);
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get("retry-after")).toBe("60");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
