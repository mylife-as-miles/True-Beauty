// Perfect Corp flow adapted from MIROIR src/lib/perfectcorp.ts (MIT; LICENSE.MIROIR).
// Legacy Node compatibility exports; native implementation is shared with Workers.
import { createHash } from "node:crypto";
export {
  PerfectCorpProvider,
  TASK_PATH,
  YOUCAM_BASE,
  FILE_PATH,
  COST_PATH,
  type ProviderFetch,
} from "./youcamSkinProvider";
export {
  skinProviderFailure,
  type SkinProviderFailure,
} from "./skinProviderFailure";
export function pricingHash(sku: unknown): string {
  return createHash("sha256").update(JSON.stringify(sku)).digest("hex");
}
