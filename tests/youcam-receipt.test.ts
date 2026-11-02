/** KEYLESS CLI CONTRACT FIXTURES: loopback only, no upstream upload or credit spend. */
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const execute = promisify(execFile);
let server: Server | undefined;
let directory: string | undefined;
afterEach(async () => {
  await new Promise<void>((done) =>
    server ? server.close(() => done()) : done(),
  );
  server = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
async function fixture(
  skinCost = 9,
  template?: string,
  mode: boolean | "clothing" = false,
) {
  directory = await mkdtemp(join(tmpdir(), "tb-keyless-receipt-fixture-"));
  const calls: { path: string; body: any }[] = [];
  const picture = await readFile("apps/web/public/images/portrait-neutral.jpg");
  server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://fixture").pathname;
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : undefined;
    calls.push({ path, body });
    const json = (data: unknown) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(data));
    };
    if (path === "/api/session") {
      res.setHeader(
        "set-cookie",
        "tb_session=fixture; HttpOnly; SameSite=Strict",
      );
      return json({ csrfToken: "non-secret-fixture-csrf" });
    }
    if (
      req.headers.cookie !== "tb_session=fixture" ||
      (req.method === "POST" &&
        req.headers["x-csrf-token"] !== "non-secret-fixture-csrf")
    ) {
      res.statusCode = 403;
      return json({ error: "fixture session required" });
    }
    const feature = path.includes("/skin/") ? "skin" : body?.spec?.feature;
    if (path.endsWith("/quotes"))
      return json({
        quoteId: "fixture-quote-" + feature,
        credits: feature === "skin" ? skinCost : 2,
      });
    if (path.endsWith("/tasks") && req.method === "POST")
      return json({ taskId: "fixture-task-" + feature, status: "running" });
    if (path.endsWith("/image")) {
      res.setHeader("content-type", "image/jpeg");
      return res.end(picture);
    }
    if (path.includes("/tasks/fixture-task-")) {
      if (path.includes("/skin/"))
        return json({
          status: "success",
          result: {
            provider: "CONTRACT-FIXTURE",
            capturedAt: new Date().toISOString(),
            overall: null,
            observations: [
              {
                id: "fixture-texture",
                concern: "texture",
                label: "FIXTURE observation",
                uiScore: 72,
                rawScore: 71.5,
                kind: "model-prediction",
                maskUrl: "https://secret.invalid/signed-token-do-not-save",
              },
            ],
            limitations: ["CONTRACT FIXTURE; not a genuine provider result."],
          },
        });
      return json({
        status: "success",
        result: {
          kind: "ai-generated-image",
          provider: "CONTRACT-FIXTURE",
          feature: path.endsWith("hair") ? "hair" : "clothing",
          receivedAt: new Date().toISOString(),
          notice: "Fixture bytes, not genuine generation.",
        },
      });
    }
    res.statusCode = 404;
    json({ error: "unknown fixture path" });
  });
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture server missing");
  const portrait = resolve("apps/web/public/images/portrait-neutral.jpg");
  const args = [
    "--import",
    "tsx",
    "apps/api/scripts/verifyYouCam.ts",
    "--api",
    `http://127.0.0.1:${address.port}`,
    ...(mode === "clothing" ? [] : ["--portrait", portrait]),
    ...(mode === "clothing"
      ? ["--clothing-only", "--person", portrait, "--garment", portrait]
      : mode
        ? ["--skin-only"]
        : [
            "--person",
            portrait,
            ...(template
              ? ["--hair-template", template]
              : ["--hair-ref", portrait]),
            "--garment",
            portrait,
          ]),
    "--max-credits",
    "13",
    "--rights-confirmed",
    "--synthetic",
    "--output",
    directory,
  ];
  // Existing local demo bytes are test input only; fixture server never contacts an external host.
  return {
    calls,
    run: (extra: string[] = []) =>
      execute(process.execPath, [...args, ...extra], { timeout: 30000 }),
    receipt: () => readFile(join(directory!, "receipt.json"), "utf8"),
  };
}
describe("keyless live-receipt runner contract fixtures", () => {
  it("rejects a combined current quote above the ceiling before any image/task transmission", async () => {
    const f = await fixture(10);
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter((c) => c.path.endsWith("/tasks"))).toHaveLength(0);
    const receipt = JSON.parse(await f.receipt());
    expect(receipt.quotedTotal).toBe(14);
    expect(receipt.operations.every((op: any) => op.status === "quoted")).toBe(
      true,
    );
    expect(receipt.billingVerified).toBe(false);
  });
  it("submits each authorized request once, captures typed results and keeps billing unverified", async () => {
    const f = await fixture();
    await f.run();
    const requests = f.calls.filter((c) => c.path.endsWith("/tasks"));
    expect(requests).toHaveLength(3);
    expect(requests[1].body.reference).toBeDefined();
    expect(requests[1].body.spec.templateId).toBeUndefined();
    expect(requests[2].body.spec.garmentCategory).toBe("upper_body");
    expect(requests[1].body.consent.rightsConfirmed).toBe(true);
    expect(requests[2].body.consent.rightsConfirmed).toBe(true);
    const text = await f.receipt(),
      receipt = JSON.parse(text);
    expect(receipt.quotedTotal).toBe(13);
    expect(receipt.allProviderTasksVerified).toBe(true);
    expect(receipt.operations.map((op: any) => op.status)).toEqual([
      "success",
      "success",
      "success",
    ]);
    expect(receipt.billingVerified).toBe(false);
    expect(receipt.actualBilledCredits).toBe(null);
    expect(text).not.toContain("signed-token-do-not-save");
    expect(text).not.toContain("fixture-csrf");
    expect(text).not.toContain("base64");
    expect(await readFile(join(directory!, "generated-hair.jpg"))).toHaveLength(
      (await readFile("apps/web/public/images/portrait-neutral.jpg")).length,
    );
  }, 30000);
  it("uses an exact provider template spec without reading or uploading a hairstyle reference", async () => {
    const f = await fixture(9, "female_s_wave_brunette");
    await f.run();
    const hairQuote = f.calls.find(
      (c) => c.path.endsWith("/quotes") && c.body?.spec?.feature === "hair",
    );
    const hairTask = f.calls.find(
      (c) => c.path.endsWith("/tasks") && c.body?.spec?.feature === "hair",
    );
    expect(hairQuote?.body.spec).toEqual({
      feature: "hair",
      hairColor: "src",
      templateId: "female_s_wave_brunette",
    });
    expect(hairTask?.body.spec).toEqual(hairQuote?.body.spec);
    expect(hairTask?.body).not.toHaveProperty("reference");
    const receipt = JSON.parse(await f.receipt());
    expect(receipt.sourceFiles).not.toHaveProperty("hair-ref");
    expect(receipt.requestedSpecs.hair).toEqual(hairQuote?.body.spec);
    expect(receipt.quotedTotal).toBe(13);
    expect(f.calls.filter((c) => c.path.endsWith("/tasks"))).toHaveLength(3);
  }, 30000);
  it("rejects ambiguous, unknown, duplicate and malformed consent options before network transmission", async () => {
    const f = await fixture();
    for (const extra of [
      ["--hair-template", "female_s_wave_brunette"],
      ["--provider-key", "not-a-key"],
      ["--max-credits", "13"],
      ["--skin-only"],
      ["--clothing-only"],
      ["--garment-category", "torso"],
    ])
      await expect(f.run(extra)).rejects.toThrow();
    await expect(
      execute(process.execPath, [
        "--import",
        "tsx",
        "apps/api/scripts/verifyYouCam.ts",
        "--rights-confirmed",
        "false",
      ]),
    ).rejects.toThrow();
    await expect(
      execute(process.execPath, [
        "--import",
        "tsx",
        "apps/api/scripts/verifyYouCam.ts",
        "--hair-template",
      ]),
    ).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
  it("skin-only mode quotes and submits one skin task without any generation endpoints or images", async () => {
    const f = await fixture(9, undefined, true);
    await f.run();
    expect(f.calls.filter((c) => c.path.includes("/generation/"))).toHaveLength(
      0,
    );
    expect(f.calls.filter((c) => c.path.endsWith("/quotes"))).toHaveLength(1);
    expect(f.calls.filter((c) => c.path.endsWith("/tasks"))).toHaveLength(1);
    const receipt = JSON.parse(await f.receipt());
    expect(receipt.mode).toBe("skin-only");
    expect(Object.keys(receipt.sourceFiles)).toEqual(["portrait"]);
    expect(receipt.operations.map((op: any) => op.feature)).toEqual(["skin"]);
    expect(receipt.requestedSpecs).not.toHaveProperty("hair");
    expect(receipt.quotedTotal).toBe(9);
  }, 30000);
  it("clothing-only mode submits the exact validated category once without skin or hair requests", async () => {
    const f = await fixture(9, undefined, "clothing");
    await f.run(["--garment-category", "upper_body"]);
    expect(f.calls.filter((c) => c.path.includes("/skin/"))).toHaveLength(0);
    const quote = f.calls.filter((c) => c.path.endsWith("/quotes"));
    const tasks = f.calls.filter((c) => c.path.endsWith("/tasks"));
    expect(quote).toHaveLength(1);
    expect(tasks).toHaveLength(1);
    expect(quote[0].body.spec.garmentCategory).toBe("upper_body");
    expect(tasks[0].body.spec).toEqual(quote[0].body.spec);
    expect(tasks[0].body.source).toBeDefined();
    expect(tasks[0].body.reference).toBeDefined();
    const receipt = JSON.parse(await f.receipt());
    expect(receipt.mode).toBe("clothing-only");
    expect(Object.keys(receipt.sourceFiles).sort()).toEqual([
      "garment",
      "person",
    ]);
    expect(receipt.operations.map((op: any) => op.feature)).toEqual([
      "clothing",
    ]);
    expect(receipt.quotedTotal).toBe(2);
    expect(receipt.requestedSpecs).not.toHaveProperty("skinActions");
    expect(receipt.requestedSpecs).not.toHaveProperty("hair");
  }, 30000);
});
