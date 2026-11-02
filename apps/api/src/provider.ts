// Perfect Corp flow adapted from MIROIR src/lib/perfectcorp.ts (MIT; LICENSE.MIROIR).
// Current endpoint corrections verified against official docs on 2026-11-02.
import { createHash } from "node:crypto";
export const YOUCAM_BASE = "https://yce-api-01.makeupar.com";
export const TASK_PATH = "/s2s/v2.1/task/skin-analysis";
export const FILE_PATH = "/s2s/v2.0/file";
export const COST_PATH = "/s2s/v2.0/credit/feature-cost";
export type ProviderFetch = typeof fetch;
type RecordValue = Record<string, unknown>;
const object = (v: unknown): RecordValue =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as RecordValue)
    : {};
export function pricingHash(sku: unknown): string {
  return createHash("sha256").update(JSON.stringify(sku)).digest("hex");
}
export class PerfectCorpProvider {
  constructor(
    private readonly key: string,
    private readonly request: ProviderFetch = fetch,
  ) {}
  private async json(
    path: string,
    init: RequestInit = {},
  ): Promise<RecordValue> {
    const response = await this.request(`${YOUCAM_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(20000),
      redirect: "error",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok)
      throw new Error(`YouCam request failed with HTTP ${response.status}.`);
    return object(await response.json());
  }
  async pricing(): Promise<unknown[]> {
    const all: unknown[] = [];
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ page_size: "20" });
      if (token) params.set("starting_token", token);
      const body = await this.json(`${COST_PATH}?${params}`),
        result = object(body.result);
      const skus = Array.isArray(result.skus) ? result.skus : [];
      for (const sku of skus) {
        const url = object(sku).run_task_url;
        if (
          typeof url === "string" &&
          new URL(url, YOUCAM_BASE).pathname === TASK_PATH
        )
          all.push(sku);
      }
      token =
        typeof result.next_token === "string" ? result.next_token : undefined;
      if (!token) break;
    }
    return all;
  }
  async create(
    bytes: Uint8Array,
    mime: "image/jpeg" | "image/png",
    actions: string[],
    overlay: boolean,
  ): Promise<string> {
    const registered = await this.json(FILE_PATH, {
      method: "POST",
      body: JSON.stringify({
        files: [
          {
            content_type: mime,
            file_name: mime === "image/png" ? "selfie.png" : "selfie.jpg",
            file_size: bytes.byteLength,
          },
        ],
      }),
    });
    const files = object(registered.data).files;
    const file = object(Array.isArray(files) ? files[0] : undefined);
    const requests = file.requests,
      upload = object(Array.isArray(requests) ? requests[0] : undefined);
    if (typeof file.file_id !== "string" || typeof upload.url !== "string")
      throw new Error("YouCam returned an invalid file registration.");
    const url = new URL(upload.url);
    // Only the documented AWS destination family; never follow arbitrary provider URLs.
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".amazonaws.com") ||
      url.username ||
      url.password
    )
      throw new Error("The provider upload destination is not allowed.");
    if (upload.method !== undefined && upload.method !== "PUT")
      throw new Error("Unsupported provider upload method.");
    const headers: Record<string, string> = { "Content-Type": mime };
    for (const [k, v] of Object.entries(object(upload.headers)))
      if (
        typeof v === "string" &&
        /^(content-type|content-length|x-amz-[a-z0-9-]+)$/i.test(k)
      )
        headers[k] = v;
    // No Authorization header is forwarded to the presigned storage endpoint.
    const sent = await this.request(url, {
      method: "PUT",
      body: new Blob([bytes as BlobPart], { type: mime }),
      headers,
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!sent.ok)
      throw new Error(`YouCam image upload failed with HTTP ${sent.status}.`);
    const task = await this.json(TASK_PATH, {
      method: "POST",
      body: JSON.stringify({
        src_file_id: file.file_id,
        dst_actions: actions,
        format: "json",
        miniserver_args: { enable_mask_overlay: overlay },
      }),
    });
    const id = object(task.data).task_id;
    if (typeof id !== "string" || id.length > 1024)
      throw new Error("YouCam task creation returned no task identifier.");
    return id;
  }
  async status(id: string): Promise<RecordValue> {
    const result = await this.json(`${TASK_PATH}/${encodeURIComponent(id)}`);
    return object(result.data);
  }
}
