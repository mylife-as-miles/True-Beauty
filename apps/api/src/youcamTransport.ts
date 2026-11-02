/** Fixed-origin Perfect Corp transport. Adapted flow from MIROIR (MIT; LICENSE.MIROIR).
 * No arbitrary browser URL, endpoint, header or credential is forwarded. */
export const YOUCAM_ORIGIN = "https://yce-api-01.makeupar.com";
export const YOUCAM_FILE_PATH = "/s2s/v2.0/file";
export const YOUCAM_COST_PATH = "/s2s/v2.0/credit/feature-cost";
export type YouCamFetch = typeof fetch;
export const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function safeYouCamMediaUrl(input: string): URL {
  const url = new URL(input);
  // Official docs show yce-us.s3-accelerate.amazonaws.com. Permit only YouCam
  // bucket names in the same S3 host family, never all AWS customer buckets.
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    !/^yce-[a-z0-9-]+\.s3(?:-accelerate|\.[a-z0-9-]+)?\.amazonaws\.com$/.test(
      url.hostname,
    )
  )
    throw new Error("The provider media destination is not allowed.");
  return url;
}
export async function readBounded(
  response: Response,
  maximum: number,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) {
    await response.body?.cancel();
    throw new Error("The provider response exceeds the size limit.");
  }
  if (!response.body)
    throw new Error("The provider returned an empty response.");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const value = await reader.read();
      if (value.done) break;
      size += value.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("The provider response exceeds the size limit.");
      }
      chunks.push(value.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result;
}
const signalFor = (signal: AbortSignal | undefined, ms: number) =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(ms)])
    : AbortSignal.timeout(ms);
export class YouCamTransport {
  constructor(
    private readonly key: string,
    // Workerd's native fetch rejects a class instance as its receiver. Keep the
    // global invocation inside a closure; injected transports remain unchanged.
    private readonly request: YouCamFetch = (input, init) => fetch(input, init),
  ) {}
  async json(
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const url = new URL(path, YOUCAM_ORIGIN);
    if (url.origin !== YOUCAM_ORIGIN || !url.pathname.startsWith("/s2s/"))
      throw new Error("Unsupported provider endpoint.");
    const response = await this.request(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: `Bearer ${this.key}`,
      },
      signal: signalFor(signal, 20000),
      redirect: "manual",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`YouCam request failed with HTTP ${response.status}.`);
    }
    const bytes = await readBounded(response, 2 * 1024 * 1024);
    const body = asRecord(JSON.parse(new TextDecoder().decode(bytes)));
    if (typeof body.status === "number" && body.status >= 400)
      throw new Error("The provider rejected this operation.");
    return body;
  }
  async upload(
    bytes: Uint8Array,
    mime: "image/jpeg" | "image/png",
    reference = false,
    signal?: AbortSignal,
  ): Promise<string> {
    const registered = await this.json(
      YOUCAM_FILE_PATH,
      {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              content_type: mime,
              file_name: `${reference ? "reference" : "portrait"}.${mime === "image/png" ? "png" : "jpg"}`,
              file_size: bytes.byteLength,
            },
          ],
        }),
      },
      signal,
    );
    const files = asRecord(registered.data).files,
      file = asRecord(Array.isArray(files) ? files[0] : undefined),
      requests = file.requests,
      upload = asRecord(Array.isArray(requests) ? requests[0] : undefined);
    if (
      typeof file.file_id !== "string" ||
      !file.file_id ||
      file.file_id.length > 1024 ||
      typeof upload.url !== "string"
    )
      throw new Error("The provider returned an invalid file registration.");
    const url = safeYouCamMediaUrl(upload.url);
    if (upload.method !== undefined && upload.method !== "PUT")
      throw new Error("Unsupported provider upload method.");
    const headers: Record<string, string> = { "Content-Type": mime };
    for (const [k, v] of Object.entries(asRecord(upload.headers)))
      if (
        typeof v === "string" &&
        v.length <= 4096 &&
        /^(content-type|content-length|x-amz-[a-z0-9-]+)$/i.test(k)
      )
        headers[k] = v;
    const response = await this.request(url, {
      method: "PUT",
      headers,
      body: new Blob([bytes as BlobPart], { type: mime }),
      signal: signalFor(signal, 30000),
      redirect: "manual",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `The provider image upload failed with HTTP ${response.status}.`,
      );
    }
    await response.body?.cancel();
    return file.file_id;
  }
  async pricing(taskPath: string, signal?: AbortSignal): Promise<unknown[]> {
    const rows: unknown[] = [];
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ page_size: "20" });
      if (token) query.set("starting_token", token);
      const body = await this.json(`${YOUCAM_COST_PATH}?${query}`, {}, signal),
        result = asRecord(body.result);
      if (!Array.isArray(result.skus))
        throw new Error("The provider pricing response is not recognized.");
      for (const sku of result.skus) {
        const path = asRecord(sku).run_task_url;
        if (typeof path !== "string") continue;
        let url: URL;
        try {
          url = new URL(path, YOUCAM_ORIGIN);
        } catch {
          continue;
        }
        if (url.origin === YOUCAM_ORIGIN && url.pathname === taskPath)
          rows.push(sku);
      }
      token =
        typeof result.next_token === "string" && result.next_token
          ? result.next_token
          : undefined;
      if (!token) return rows;
    }
    throw new Error("The provider pricing list exceeded the pagination limit.");
  }
  async image(
    url: string,
    signal?: AbortSignal,
  ): Promise<{
    bytes: Uint8Array;
    contentType: "image/png" | "image/jpeg" | "image/webp";
  }> {
    const response = await this.request(safeYouCamMediaUrl(url), {
      signal: signalFor(signal, 30000),
      redirect: "manual",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("The generated image could not be downloaded.");
    }
    const bytes = await readBounded(response, 8 * 1024 * 1024);
    const png =
        bytes.length >= 16 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v),
      jpeg =
        bytes.length >= 16 &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255;
    const webp =
      bytes.length >= 16 &&
      new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
    const type = png
      ? "image/png"
      : jpeg
        ? "image/jpeg"
        : webp
          ? "image/webp"
          : null;
    if (!type) throw new Error("The provider output is not a supported image.");
    return { bytes, contentType: type };
  }
}
