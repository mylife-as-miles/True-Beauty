/** Zero-generation operator diagnostic. Never prints keys, bearer headers or signed media URLs. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { YouCamTransport, asRecord } from "./youcamTransport";
import { configuredGenerationPlans } from "./generation";
import { GENERATION_TASK_PATHS } from "./generationContracts";
import { pricingHash, TASK_PATH } from "./provider";
export async function inspectYouCamConfiguration(checkConnection = false) {
  const key = process.env.YOUCAM_API_KEY;
  const report: Record<string, unknown> = {
    credentialConfigured: !!key,
    paidEnabled: process.env.YOUCAM_ENABLE_PAID === "true",
    dailyCreditCeilingConfigured:
      Number(process.env.YOUCAM_MAX_DAILY_CREDITS) > 0,
    generationPlans: configuredGenerationPlans().map((p) => ({
      feature: p.spec.feature,
      reviewedAt: p.reviewedAt,
      credits: p.credits,
      skuHash: p.skuHash,
    })),
    liveGenerationVerified: false,
    connectionChecked: false,
  };
  if (!checkConnection || !key) return report;
  const client = new YouCamTransport(key);
  try {
    const balance = await client.json("/s2s/v1.0/client/credit");
    report.connectionChecked = true;
    report.authenticatedMetadataReadSucceeded = true;
    if (Array.isArray(balance.results))
      report.spendableApiUnits = balance.results.reduce((n, row) => {
        const item = asRecord(row);
        return (
          n +
          (typeof item.type === "string" &&
          item.type.startsWith("Api") &&
          typeof item.amount === "number" &&
          Number.isFinite(item.amount)
            ? item.amount
            : 0)
        );
      }, 0);
    const pricing: Record<string, unknown> = {};
    for (const [feature, path] of Object.entries({
      skin: TASK_PATH,
      ...GENERATION_TASK_PATHS,
    }))
      pricing[feature] = (await client.pricing(path)).map((row) => {
        const item = asRecord(row);
        return {
          skuHash: pricingHash(row),
          description:
            typeof item.description === "string"
              ? item.description.slice(0, 500)
              : undefined,
          amount: typeof item.amount === "number" ? item.amount : undefined,
          unit: item.unit,
          procUnit: item.proc_unit,
        };
      });
    report.pricing = pricing;
  } catch {
    report.connectionChecked = true;
    report.authenticatedMetadataReadSucceeded = false;
    report.error =
      "Provider metadata could not be verified. No generation or image upload was attempted.";
  }
  return report;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(
    JSON.stringify(
      await inspectYouCamConfiguration(
        process.argv.includes("--check-connection"),
      ),
      null,
      2,
    ),
  );
