/** Read-only dispatch/binding probe. Does not initialize budget or call providers. */
import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
const origin = "https://true-beauty-miles.myles4miles.chatgpt.site";
const reader = createInterface({ input: process.stdin, terminal: false });
process.stdout.write(
  "Ready for nonpublic owner probe identifiers on hidden stdin.\n",
);
const owner = JSON.parse(
  await new Promise((resolve) => reader.once("line", resolve)),
);
reader.close();
const get = (path, headers) =>
  fetch(origin + path, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
const health = await get("/api/health");
const healthBody = await health.json();
if (health.status !== 200 || healthBody.service !== "true-beauty-cloud")
  throw new Error("Native Worker is not live.");
const ordinary = await get("/api/operator/status");
const ordinaryBody = await ordinary.json();
const spoofed = await get("/api/operator/status", {
  "oai-authenticated-user-id": owner.id,
  "oai-authenticated-user-email": owner.email,
});
const spoofBody = await spoofed.json();
const discovery = await get("/api/capabilities");
const capabilities = await discovery.json();
const session = await get("/api/session");
const sessionBody = await session.json();
const cookie = session.headers.get("set-cookie")?.split(";")[0];
const privateResponse = await get("/api/operator/budget", { cookie });
const unknown = await get("/api/not-a-real-route", { cookie });
const receipt = {
  checkedAt: new Date().toISOString(),
  origin,
  health: healthBody,
  anonymous: ordinaryBody,
  spoofed: spoofBody,
  strippingVerified:
    spoofed.status === 200 &&
    spoofBody.operator === false &&
    spoofBody.dispatchIdentityPresent === false &&
    spoofBody.dispatchEmailPresent === false,
  discoveryStatus: discovery.status,
  firstVisitCookie: !!discovery.headers.get("set-cookie"),
  configuredProviders: {
    skin: !!capabilities.skinAnalysis?.configured,
    hair: !!capabilities.hairGeneration?.configured,
    clothing: !!capabilities.fashionGeneration?.configured,
    reasoning: capabilities.languageModel?.provider,
  },
  anonymousSession: {
    hosted: sessionBody.hosted,
    operator: sessionBody.operator,
  },
  anonymousBudgetStatus: privateResponse.status,
  unknownApiStatus: unknown.status,
  noPaidCalls: true,
  noImagesOrPersonalHistoryTransmitted: true,
};
await mkdir("cook/evidence/r07-hosted", { recursive: true });
await writeFile(
  "cook/evidence/r07-hosted/boundary.json",
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify(receipt));
if (
  !receipt.strippingVerified ||
  discovery.status !== 200 ||
  privateResponse.status !== 403 ||
  unknown.status !== 404
)
  process.exitCode = 1;
