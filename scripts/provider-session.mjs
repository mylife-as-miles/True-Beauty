/** Operator-only ephemeral secret input. Values are not written to files, arguments, or output. */
import { createInterface } from "node:readline";
const reader = createInterface({ input: process.stdin, terminal: false });
process.stdout.write(
  "Ready for provider configuration JSON on stdin (input is hidden).\n",
);
const input = JSON.parse(
  await new Promise((resolve) => reader.once("line", resolve)),
);
reader.close();
const allowed = [
  "YOUCAM_API_KEY",
  "ANTHROPIC_API_KEY",
  "YOUCAM_ENABLE_PAID",
  "YOUCAM_MAX_DAILY_CREDITS",
  "YOUCAM_SKIN_PLAN_JSON",
  "YOUCAM_GENERATION_PLANS_JSON",
  "TB_REASONING_PROVIDER",
  "TB_REASONING_MODEL",
  "TB_REASONING_PRICING_JSON",
  "TB_REASONING_ENABLE_PAID",
  "TB_REASONING_DAILY_USD",
  "TB_REASONING_MAX_REQUEST_USD",
  "API_ALLOWED_ORIGINS",
];
for (const name of allowed)
  if (typeof input[name] === "string") process.env[name] = input[name];
const { createApi } = await import("../apps/api/src/server.ts");
const port = Number(input.API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 3001 || port > 3009)
  throw new Error("Invalid local provider port");
const app = createApi();
await app.listen({ host: "127.0.0.1", port });
console.log(
  `Provider API listening on 127.0.0.1:${port}; secrets are process-local. Pricing and request consent remain required.`,
);
const { inspectYouCamConfiguration } =
  await import("../apps/api/src/youcamDiagnostics.ts");
const report = { youcam: await inspectYouCamConfiguration(true) };
try {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(20000),
  });
  let raw;
  try {
    raw = await response.json();
  } catch {
    /* Non-JSON metadata is reported only by status. */
  }
  report.claude = {
    status: response.status,
    authenticated: response.ok,
    models: response.ok
      ? raw?.data?.map((x) => ({ id: x.id, display_name: x.display_name }))
      : undefined,
    errorType: response.ok ? undefined : raw?.error?.type,
  };
} catch {
  report.claude = {
    authenticated: false,
    error: "Provider metadata connection failed",
  };
}
console.log(JSON.stringify({ providerVerificationMetadata: report }));
