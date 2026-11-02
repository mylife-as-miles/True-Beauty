// Perfect Corp flow adapted from MIROIR src/lib/perfectcorp.ts (MIT; LICENSE.MIROIR).
// Current endpoint corrections verified against official docs on 2026-11-02.
import { createHash } from "node:crypto";
import { skinProviderFailure } from "./skinProviderFailure";
export {
  skinProviderFailure,
  type SkinProviderFailure,
} from "./skinProviderFailure";
import {
  YouCamTransport,
  asRecord,
  YOUCAM_ORIGIN,
  YOUCAM_FILE_PATH,
  YOUCAM_COST_PATH,
  type YouCamFetch,
} from "./youcamTransport";
export const YOUCAM_BASE = YOUCAM_ORIGIN;
export const TASK_PATH = "/s2s/v2.1/task/skin-analysis";
export const FILE_PATH = YOUCAM_FILE_PATH;
export const COST_PATH = YOUCAM_COST_PATH;
export type ProviderFetch = YouCamFetch;
export function pricingHash(sku: unknown): string {
  return createHash("sha256").update(JSON.stringify(sku)).digest("hex");
}
/** Skin and generation share the same fixed-origin, bounded, credential-isolated transport. */
export class PerfectCorpProvider {
  private readonly transport: YouCamTransport;
  constructor(key: string, request?: ProviderFetch) {
    this.transport = new YouCamTransport(key, request);
  }
  pricing() {
    return this.transport.pricing(TASK_PATH);
  }
  async create(
    bytes: Uint8Array,
    mime: "image/jpeg" | "image/png",
    actions: string[],
    overlay: boolean,
  ) {
    const fileId = await this.transport.upload(bytes, mime);
    const task = await this.transport.json(TASK_PATH, {
      method: "POST",
      body: JSON.stringify({
        src_file_id: fileId,
        dst_actions: actions,
        format: "json",
        miniserver_args: { enable_mask_overlay: overlay },
      }),
    });
    const id = asRecord(task.data).task_id;
    if (typeof id !== "string" || !id || id.length > 1024)
      throw new Error("YouCam task creation returned no task identifier.");
    return id;
  }
  async status(id: string) {
    const result = await this.transport.json(
      `${TASK_PATH}/${encodeURIComponent(id)}`,
    );
    const data = asRecord(result.data);
    // Engine failure messages can contain arbitrary upstream text. Only a known
    // code (or a static unknown marker) crosses the provider adapter boundary.
    return data.task_status === "error"
      ? { task_status: "error", error: skinProviderFailure(data).code }
      : data;
  }
}
