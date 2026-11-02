/** Closed recovery mapping, verified against official skin v2.1 schema/overview and
 * develop/error_codes.md on 2026-11-02. Never render provider error_message/free text. */
import { asRecord } from "./youcamTransport";
const failures = {
  error_below_min_image_size: [
    "The provider rejected the image resolution as too small.",
    "Use a JPEG/PNG with a short edge of at least 480px for SD or 1080px for HD, and no edge above 2560px.",
    "change-input-and-authorize",
  ],
  error_exceed_max_image_size: [
    "The provider rejected the image dimensions as too large.",
    "Resize the original so neither edge exceeds 2560px, preserving the required minimum resolution and frontal face framing.",
    "change-input-and-authorize",
  ],
  exceed_max_filesize: [
    "The provider rejected the file size.",
    "Export a valid JPEG/PNG within this app's 4MB limit and check the current provider limits before authorizing another request.",
    "change-input-and-authorize",
  ],
  error_src_face_too_small: [
    "The provider found the face too small in the image.",
    "Frame the full frontal face at more than 60% of the image width, keeping the forehead and chin inside the image.",
    "change-input-and-authorize",
  ],
  error_src_face_out_of_bound: [
    "The provider found the face outside the usable image boundary.",
    "Keep the entire face, forehead and chin inside the image with a little margin, then review the framing before a new authorization.",
    "change-input-and-authorize",
  ],
  error_lighting_dark: [
    "The provider rejected the lighting as too dark.",
    "Use bright, even light without deep shadows or blown-out highlights. Changing brightness digitally is not a substitute for a suitable original capture.",
    "change-input-and-authorize",
  ],
  error_no_face: [
    "The provider did not detect a usable face.",
    "Use one unobstructed, front-facing face with open eyes and a closed mouth. A synthetic test fixture may not be accepted; this error does not establish a person's skin condition.",
    "change-input-and-authorize",
  ],
  error_multiple_people: [
    "The provider detected more than one person.",
    "Choose an image containing only the consenting subject, with one fully visible frontal face.",
    "change-input-and-authorize",
  ],
  error_pose: [
    "The provider could not use the detected pose.",
    "Use a centered, relaxed, front-facing portrait without tilting the head or covering facial regions.",
    "change-input-and-authorize",
  ],
  error_large_face_angle: [
    "The provider rejected the face angle.",
    "Look straight into the camera with the full face visible and review the source framing before a new authorization.",
    "change-input-and-authorize",
  ],
  error_face_parsing: [
    "The provider could not segment the face reliably.",
    "Review the unobstructed frontal face, hairline and even lighting. If a compliant image still fails, ask the provider to investigate before spending again.",
    "change-input-and-authorize",
  ],
  error_download_image: [
    "The provider could not download the registered source image.",
    "The operator should verify file registration and upload completion. Check the provider task and billing before authorizing another submission.",
    "operator-review",
  ],
  error_download_mask: [
    "The provider could not download a required mask.",
    "The operator should review the documented request and provider task. Do not automatically resubmit or assume the source portrait caused the failure.",
    "operator-review",
  ],
  error_decode_image: [
    "The provider could not decode the source image.",
    "Re-export the original as a standard JPEG or PNG and check that it opens correctly. A recognized file signature alone does not prove successful decoding.",
    "change-input-and-authorize",
  ],
  error_decode_mask: [
    "The provider could not decode a required mask.",
    "The operator should review the provider request and mask format before authorizing another task.",
    "operator-review",
  ],
  invalid_parameter: [
    "The provider rejected a request parameter.",
    "The operator should compare the exact action set, tier and request fields with the current official schema before any new paid submission.",
    "operator-review",
  ],
  InvalidParameters: [
    "The provider rejected the request parameters.",
    "The operator should verify the exact supported concern names and avoid mixing SD and HD actions before a new authorization.",
    "operator-review",
  ],
  CreditInsufficiency: [
    "The provider reported insufficient available credits.",
    "The operator should review the actual provider balance and existing reservations. No automatic paid retry will run.",
    "operator-review",
  ],
  BadRequest: [
    "The provider rejected the request format.",
    "The operator should inspect the documented request contract and current provider account configuration before any new paid submission.",
    "operator-review",
  ],
  error_inference: [
    "The provider's analysis pipeline failed.",
    "Check the provider task and billing with support. This code does not identify a skin concern or prove that changing the photo will resolve it.",
    "operator-review",
  ],
  error_upload: [
    "The provider could not upload its result.",
    "The operator should check the existing provider task and billing before considering a separately authorized retry.",
    "operator-review",
  ],
  unknown_internal_error: [
    "The provider reported an internal processing error.",
    "The operator should check the existing task with provider support. Do not infer a photo-quality cause or automatically spend again.",
    "operator-review",
  ],
  error_nsfw_content_detected: [
    "The provider's content policy check rejected this image.",
    "Review the provider's image policy and use an appropriate beauty portrait. Do not automatically retry the rejected request.",
    "review-provider-policy",
  ],
  exceed_nsfw_retry_limits: [
    "The provider's policy retry limit was reached.",
    "Stop further submissions and ask the operator or provider to review the policy rejection.",
    "review-provider-policy",
  ],
} as const;
export type KnownSkinProviderErrorCode = keyof typeof failures;
export interface SkinProviderFailure {
  code: KnownSkinProviderErrorCode | "unrecognized_provider_error";
  known: boolean;
  summary: string;
  recovery: string;
  nextStep:
    "change-input-and-authorize" | "operator-review" | "review-provider-policy";
  automaticRetry: false;
}
/** Status errors are data.error in the current schema; data.error_code is a
 * documented request-error compatibility field. Only exact allowlisted values survive. */
export function skinProviderFailure(input: unknown): SkinProviderFailure {
  const data = asRecord(input);
  const code = [data.error, data.error_code].find(
    (value) => typeof value === "string" && Object.hasOwn(failures, value),
  ) as KnownSkinProviderErrorCode | undefined;
  if (!code)
    return {
      code: "unrecognized_provider_error",
      known: false,
      summary:
        "The provider rejected this analysis without a recognized error code.",
      recovery:
        "Check the existing task and billing with the provider before another paid submission. No specific image defect or skin observation can be inferred from this response.",
      nextStep: "operator-review",
      automaticRetry: false,
    };
  const [summary, recovery, nextStep] = failures[code];
  return {
    code,
    known: true,
    summary,
    recovery,
    nextStep,
    automaticRetry: false,
  };
}
