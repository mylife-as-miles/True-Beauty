import {
  YouCamTransport,
  asRecord,
  safeYouCamMediaUrl,
  type YouCamFetch,
} from "./youcamTransport";
import {
  GENERATION_TASK_PATHS,
  type GenerationFeature,
  type GenerationSpec,
} from "./generationContracts";
export interface GenerationInput {
  source: { bytes: Uint8Array; contentType: "image/jpeg" | "image/png" };
  reference?: { bytes: Uint8Array; contentType: "image/jpeg" | "image/png" };
  spec: GenerationSpec;
}
export interface GenerationProvider {
  pricing(feature: GenerationFeature, signal?: AbortSignal): Promise<unknown[]>;
  create(input: GenerationInput, signal?: AbortSignal): Promise<string>;
  status(
    feature: GenerationFeature,
    id: string,
    signal?: AbortSignal,
  ): Promise<{
    status: "running" | "success" | "error";
    url?: string;
    error?: string;
  }>;
  image(
    url: string,
    signal?: AbortSignal,
  ): Promise<{
    bytes: Uint8Array;
    contentType: "image/png" | "image/jpeg" | "image/webp";
  }>;
  templates?(
    token?: string,
    signal?: AbortSignal,
  ): Promise<{
    templates: { id: string; title: string }[];
    nextToken?: string;
  }>;
}
export class YouCamGenerationProvider implements GenerationProvider {
  private readonly transport: YouCamTransport;
  constructor(key: string, request?: YouCamFetch) {
    this.transport = new YouCamTransport(key, request);
  }
  pricing(feature: GenerationFeature, signal?: AbortSignal) {
    return this.transport.pricing(GENERATION_TASK_PATHS[feature], signal);
  }
  async create(input: GenerationInput, signal?: AbortSignal) {
    const sourceId = await this.transport.upload(
      input.source.bytes,
      input.source.contentType,
      false,
      signal,
    );
    const referenceId = input.reference
      ? await this.transport.upload(
          input.reference.bytes,
          input.reference.contentType,
          true,
          signal,
        )
      : undefined;
    const spec = input.spec;
    let body: Record<string, unknown>;
    if (spec.feature === "hair") {
      if (!spec.templateId && !referenceId)
        throw new Error("A hairstyle reference or template is required.");
      if (spec.templateId && referenceId)
        throw new Error("Only one hairstyle reference is allowed.");
      body = {
        src_file_id: sourceId,
        hair_color: spec.hairColor,
        ...(spec.templateId
          ? { template_id: spec.templateId }
          : { ref_file_id: referenceId }),
      };
    } else {
      if (!referenceId)
        throw new Error("A garment reference image is required.");
      body = {
        src_file_id: sourceId,
        ref_file_id: referenceId,
        garment_category: spec.garmentCategory,
        change_shoes: spec.changeShoes,
        filter_multi_person: spec.filterMultiPerson,
      };
    }
    const response = await this.transport.json(
      GENERATION_TASK_PATHS[spec.feature],
      { method: "POST", body: JSON.stringify(body) },
      signal,
    );
    const id = asRecord(response.data).task_id;
    if (typeof id !== "string" || !id || id.length > 1024)
      throw new Error("The provider returned no generation task identifier.");
    return id;
  }
  async status(
    feature: GenerationFeature,
    id: string,
    signal?: AbortSignal,
  ): Promise<{
    status: "running" | "success" | "error";
    url?: string;
    error?: string;
  }> {
    const response = await this.transport.json(
        `${GENERATION_TASK_PATHS[feature]}/${encodeURIComponent(id)}`,
        {},
        signal,
      ),
      data = asRecord(response.data);
    if (data.task_status === "running") return { status: "running" };
    if (data.task_status === "error")
      return {
        status: "error",
        error:
          "The provider could not generate this image. Check the portrait and reference framing before a new, separately authorized request.",
      };
    if (data.task_status !== "success")
      throw new Error("The provider returned an unknown generation status.");
    const url = asRecord(data.results).url;
    if (typeof url !== "string")
      throw new Error(
        "The provider completed the task without a generated image URL.",
      );
    safeYouCamMediaUrl(url);
    return { status: "success", url };
  }
  image(url: string, signal?: AbortSignal) {
    return this.transport.image(url, signal);
  }
  async templates(token?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ page_size: "20" });
    if (token) query.set("starting_token", token);
    const response = await this.transport.json(
        `/s2s/v2.1/task/template/hair-transfer?${query}`,
        {},
        signal,
      ),
      data = asRecord(response.data ?? response.result);
    const candidates = Array.isArray(data.templates)
      ? data.templates
      : Array.isArray(data.styles)
        ? data.styles
        : undefined;
    if (!candidates)
      throw new Error(
        "The provider hairstyle template list is not recognized.",
      );
    const templates = candidates.slice(0, 20).flatMap((item) => {
      const row = asRecord(item);
      return typeof row.id === "string" &&
        typeof row.title === "string" &&
        /^[\w.:-]{1,200}$/.test(row.id)
        ? [{ id: row.id, title: row.title.slice(0, 120) }]
        : [];
    });
    return {
      templates,
      nextToken:
        typeof data.next_token === "string" ? data.next_token : undefined,
    };
  }
}
