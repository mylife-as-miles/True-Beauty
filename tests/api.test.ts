import { describe, it, expect } from "vitest";
import { createApi } from "../apps/api/src/server";
import { pricingHash, PerfectCorpProvider } from "../apps/api/src/provider";
import { imageBytes, ApprovedPlan } from "../apps/api/src/contracts";
const origin = "http://localhost:5173";
async function session(app: ReturnType<typeof createApi>) {
  const res = await app.inject({ method: "GET", url: "/api/session" });
  return {
    origin,
    cookie: res.headers["set-cookie"]!.toString().split(";")[0],
    "x-csrf-token": res.json().csrfToken,
  };
}
const sku = {
  run_task_url: "https://yce-api-01.makeupar.com/s2s/v2.1/task/skin-analysis",
  amount: 4,
  description: "test fixture only",
};
const testPlan = {
  actions: ["texture"],
  credits: 4,
  skuHash: pricingHash(sku),
  reviewedAt: new Date().toISOString(),
};
const png = Buffer.alloc(120);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
describe("secure provider boundary (contract fixtures, not live API verification)", () => {
  it("reports unavailable honestly when credentials and price plan are absent", async () => {
    const app = createApi();
    const res = await app.inject({ method: "GET", url: "/api/capabilities" });
    expect(res.json().skinAnalysis.configured).toBe(false);
    expect(res.json().skinAnalysis.liveVerified).toBe(false);
    const h = await session(app);
    const quote = await app.inject({
      method: "POST",
      url: "/api/skin/quotes",
      headers: h,
      payload: { actions: ["texture"] },
    });
    expect(quote.statusCode).toBe(503);
    await app.close();
  });
  it("rejects browser mutation without an allowed origin and CSRF capability", async () => {
    const app = createApi();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/skin/tasks",
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/session",
          headers: { origin: "https://evil.example" },
        })
      ).statusCode,
    ).toBe(403);
    await app.close();
  });
  it("requires explicit consent, exact quote actions, budget and valid bytes before transmission", async () => {
    let uploads = 0,
      used = 0;
    const provider = {
      pricing: async () => [sku],
      create: async () => {
        uploads++;
        return "provider-task";
      },
      status: async () => ({ task_status: "running" }),
    };
    const ledger = {
      used: () => used,
      reserve: (n: number, max: number) => {
        if (used + n > max) throw new Error("limit");
        used += n;
      },
    };
    const app = createApi({
      provider,
      plan: ApprovedPlan.parse(testPlan),
      dailyCredits: 8,
      ledger,
    });
    const h = await session(app);
    const quote = (
      await app.inject({
        method: "POST",
        url: "/api/skin/quotes",
        headers: h,
        payload: { actions: ["texture"] },
      })
    ).json();
    const payload = {
      quoteId: quote.quoteId,
      imageBase64: png.toString("base64"),
      contentType: "image/png",
      actions: ["texture"],
      maxCredits: 4,
      consent: {
        uploadImage: true,
        externalProcessing: true,
        providerRetentionAcknowledged: true,
      },
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/skin/tasks",
          headers: h,
          payload: { ...payload, consent: { uploadImage: false } },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/skin/tasks",
          headers: h,
          payload: { ...payload, maxCredits: 3 },
        })
      ).statusCode,
    ).toBe(402);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/skin/tasks",
          headers: h,
          payload: { ...payload, actions: ["pore"] },
        })
      ).statusCode,
    ).toBe(400);
    expect(uploads).toBe(0);
    const sent = await app.inject({
      method: "POST",
      url: "/api/skin/tasks",
      headers: h,
      payload,
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().status).toBe("running");
    const replay = await app.inject({
      method: "POST",
      url: "/api/skin/tasks",
      headers: h,
      payload,
    });
    expect(replay.json().taskId).toBe(sent.json().taskId);
    expect(uploads).toBe(1);
    expect(used).toBe(4);
    const other = await session(app);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/skin/tasks/" + sent.json().taskId,
          headers: other,
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });
  it("fails closed if published SKU changed", async () => {
    const app = createApi({
      provider: {
        pricing: async () => [{ ...sku, amount: 40 }],
        create: async () => {
          throw new Error("must not run");
        },
        status: async () => ({}),
      },
      plan: ApprovedPlan.parse(testPlan),
      dailyCredits: 10,
      ledger: { used: () => 0, reserve: () => {} },
    });
    const h = await session(app);
    const quote = await app.inject({
      method: "POST",
      url: "/api/skin/quotes",
      headers: h,
      payload: { actions: ["texture"] },
    });
    expect(quote.statusCode).toBe(503);
    await app.close();
  });
  it("enforces current SD/HD plan boundaries and file signatures", () => {
    expect(
      ApprovedPlan.safeParse({ ...testPlan, actions: ["texture", "hd_pore"] })
        .success,
    ).toBe(false);
    expect(() =>
      imageBytes(Buffer.alloc(120).toString("base64"), "image/png"),
    ).toThrow();
    expect(() => imageBytes("not+base64!", "image/jpeg")).toThrow();
  });
  it("never forwards provider auth to presigned uploads and uses current official paths", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const request = async (
      input: RequestInfo | URL,
      init: RequestInit = {},
    ) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/s2s/v2.0/file"))
        return Response.json({
          data: {
            files: [
              {
                file_id: "file",
                requests: [
                  {
                    method: "PUT",
                    url: "https://yce-us.s3-accelerate.amazonaws.com/private",
                    headers: { "Content-Type": "image/png" },
                  },
                ],
              },
            ],
          },
        });
      if (url.includes("amazonaws.com"))
        return new Response("", { status: 200 });
      return Response.json({ data: { task_id: "task" } });
    };
    const provider = new PerfectCorpProvider("server-secret", request);
    expect(await provider.create(png, "image/png", ["texture"], false)).toBe(
      "task",
    );
    expect(calls[0].url).toContain("/s2s/v2.0/file");
    expect(
      (calls[1].init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
    expect(
      (calls[2].init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer server-secret");
  });
});
