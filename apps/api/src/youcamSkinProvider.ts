// Actual MIROIR metadata/upload/task flow adapted under MIT; see LICENSE.MIROIR.
// Fetch/WebCrypto runtime compatible; no filesystem, process globals or Node imports.
import {
  YouCamTransport,
  asRecord,
  YOUCAM_ORIGIN,
  YOUCAM_FILE_PATH,
  YOUCAM_COST_PATH,
  type YouCamFetch,
} from "./youcamTransport";
import { skinProviderFailure } from "./skinProviderFailure";
export const TASK_PATH = "/s2s/v2.1/task/skin-analysis";
export const YOUCAM_BASE = YOUCAM_ORIGIN,
  FILE_PATH = YOUCAM_FILE_PATH,
  COST_PATH = YOUCAM_COST_PATH;
export type ProviderFetch = YouCamFetch;
/** Skin and generation share the same fixed-origin, bounded, credential-isolated transport. */
export class PerfectCorpProvider {
  private readonly transport: YouCamTransport;
  constructor(key: string, request?: ProviderFetch) {
    this.transport = new YouCamTransport(key, request);
  }
  pricing(signal?: AbortSignal) {
    return this.transport.pricing(TASK_PATH, signal);
  }
  async create(
    bytes: Uint8Array,
    mime: "image/jpeg" | "image/png",
    actions: string[],
    overlay: boolean,
    signal?: AbortSignal,
    beforeCreate?: () => Promise<void>,
  ) {
    const fileId = await this.transport.upload(bytes, mime, false, signal);
    await beforeCreate?.();
    const task = await this.transport.json(
      TASK_PATH,
      {
        method: "POST",
        body: JSON.stringify({
          src_file_id: fileId,
          dst_actions: actions,
          format: "json",
          miniserver_args: { enable_mask_overlay: overlay },
        }),
      },
      signal,
    );
    const id = asRecord(task.data).task_id;
    if (typeof id !== "string" || !id || id.length > 1024)
      throw new Error("YouCam task creation returned no task identifier.");
    return id;
  }
  async status(id: string, signal?: AbortSignal) {
    const result = await this.transport.json(
      `${TASK_PATH}/${encodeURIComponent(id)}`,
      {},
      signal,
    );
    const data = asRecord(result.data);
    // Engine failure messages can contain arbitrary upstream text. Only a known
    // code (or a static unknown marker) crosses the provider adapter boundary.
    return data.task_status === "error"
      ? { task_status: "error", error: skinProviderFailure(data).code }
      : data;
  }
}
