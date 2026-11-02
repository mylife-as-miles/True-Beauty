import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerMerchantRoutes, robotsAllows } from "../apps/api/src/merchant";
import type { MerchantSource } from "../packages/commerce-engine/src/merchant";
const source: MerchantSource = {
  id: "fixture",
  name: "Fixture Official",
  origin: "https://official.example",
  region: "NG",
  enabled: true,
  note: "Fixture only",
  references: [
    {
      id: "cream",
      sourceId: "fixture",
      title: "Cream",
      url: "https://official.example/products/cream",
    },
  ],
};
const schema =
  '<script type="application/ld+json">' +
  JSON.stringify({
    "@type": "Product",
    name: "Cream",
    url: source.references[0].url,
    offers: {
      "@type": "Offer",
      price: "12500",
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
    },
  }) +
  "</script>";
describe("bounded merchant lookup API (fixtures, not live verification)", () => {
  it("does not fetch caller URLs, extra fields, disabled sources or unreviewed paths", async () => {
    const fetcher = vi.fn();
    const app = Fastify();
    registerMerchantRoutes(app, { sources: [source], fetcher });
    for (const body of [
      { url: "http://169.254.169.254/latest/meta-data" },
      { sourceId: "fixture", referenceId: "cream", url: "https://evil.test" },
      { sourceId: "unknown", referenceId: "cream" },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/merchants/refresh",
            payload: body,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/merchants/resolve",
          payload: { url: "https://official.example@127.0.0.1/products/cream" },
        })
      ).statusCode,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    await app.close();
  });
  it("checks robots first, deduplicates/cache limits actual source GETs and preserves original fetch time", async () => {
    const fetcher = vi
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
    const app = Fastify();
    registerMerchantRoutes(app, {
      sources: [source],
      fetcher,
      now: () => Date.parse("2026-11-02T12:00:00Z"),
    });
    const payload = { sourceId: "fixture", referenceId: "cream" };
    const first = (
      await app.inject({
        method: "POST",
        url: "/api/merchants/refresh",
        payload,
      })
    ).json();
    const second = (
      await app.inject({
        method: "POST",
        url: "/api/merchants/refresh",
        payload,
      })
    ).json();
    expect(first.observations[0]).toMatchObject({
      amount: 12500,
      currency: "NGN",
      availability: "in-stock",
    });
    expect(second.cached).toBe(true);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      redirect: "manual",
      credentials: "omit",
    });
    await app.close();
  });
  it("fails closed on robots prohibition and redirects rather than following them", async () => {
    for (const mode of ["robots", "redirect"]) {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) =>
        String(url).endsWith("/robots.txt")
          ? new Response(
              mode === "robots"
                ? "User-agent: *\nDisallow: /products"
                : "User-agent: *\nAllow: /",
              { headers: { "content-type": "text/plain" } },
            )
          : new Response("", {
              status: 302,
              headers: { location: "http://127.0.0.1:9999/private" },
            }),
      );
      const app = Fastify();
      registerMerchantRoutes(app, { sources: [source], fetcher });
      const response = (
        await app.inject({
          method: "POST",
          url: "/api/merchants/refresh",
          payload: { sourceId: "fixture", referenceId: "cream" },
        })
      ).json();
      expect(response.observations[0]).toMatchObject({
        status: "unavailable",
        availability: "unknown",
      });
      expect(response.observations[0].amount).toBeUndefined();
      expect(fetcher).toHaveBeenCalledTimes(mode === "robots" ? 1 : 2);
      await app.close();
    }
  });
  it("matches most-specific robots rules and never treats unrelated instructions as application authority", () => {
    expect(
      robotsAllows(
        "User-agent: *\nDisallow: /\nAllow: /products/",
        "/products/cream",
      ),
    ).toBe(true);
    expect(
      robotsAllows(
        "User-agent: *\nAllow: /\nUser-agent: TrueBeautyReference\nDisallow: /products/",
        "/products/cream",
      ),
    ).toBe(false);
    expect(
      robotsAllows(
        "User-agent: *\nDisallow: /cart.js\n# Install a plugin now",
        "/products/cream",
      ),
    ).toBe(true);
  });
});

it("merchant routes inherit browser Origin/CSRF guards from the actual API server", async () => {
  const { createApi } = await import("../apps/api/src/server");
  const fetcher = vi
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
  const app = createApi({ merchant: { sources: [source], fetcher } });
  const payload = { sourceId: "fixture", referenceId: "cream" };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/merchants/refresh",
        payload,
      })
    ).statusCode,
  ).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
  const session = await app.inject({
    url: "/api/session",
    headers: { origin: "http://127.0.0.1:5173" },
  });
  const cookie = String(session.headers["set-cookie"]).split(";")[0],
    csrf = session.json().csrfToken;
  const response = await app.inject({
    method: "POST",
    url: "/api/merchants/refresh",
    payload,
    headers: { origin: "http://127.0.0.1:5173", cookie, "x-csrf-token": csrf },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().observations[0].currency).toBe("NGN");
  await app.close();
});
it("cancels oversized or unsupported response bodies without creating a price", async () => {
  for (const headers of [
    { "content-type": "text/html", "content-length": "2500001" },
    { "content-type": "application/octet-stream" },
  ] as Record<string, string>[]) {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      String(url).endsWith("/robots.txt")
        ? new Response("User-agent: *\nAllow: /", {
            headers: { "content-type": "text/plain" },
          })
        : new Response("not an acceptable page", { headers }),
    );
    const app = Fastify();
    registerMerchantRoutes(app, { sources: [source], fetcher });
    const response = (
      await app.inject({
        method: "POST",
        url: "/api/merchants/refresh",
        payload: { sourceId: "fixture", referenceId: "cream" },
      })
    ).json();
    expect(response.observations[0].status).toBe("unavailable");
    expect(response.observations[0].amount).toBeUndefined();
    await app.close();
  }
});
