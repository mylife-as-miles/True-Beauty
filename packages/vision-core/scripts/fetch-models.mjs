import {
  mkdir,
  readFile,
  readdir,
  copyFile,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.join(root, "apps/web/public/models");
await mkdir(output, { recursive: true });
const urls = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "hair_segmenter.tflite":
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite",
  "selfie_multiclass_256x256.tflite":
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "hand_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
};
const expectedHashes = {
  "face_landmarker.task":
    "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
  "hair_segmenter.tflite":
    "2628cf3ce5f695f604cbea2841e00befcaa3624bf80caf3664bef2656d59bf84",
  "hand_landmarker.task":
    "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
  "selfie_multiclass_256x256.tflite":
    "c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0",
  "pose_landmarker_lite.task":
    "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
};
const manifest = [];
for (const [name, url] of Object.entries(urls)) {
  const target = path.join(output, name);
  const temporary = target + ".download";
  // curl uses the inherited session proxy and CA trust, with verification enabled.
  execFileSync(
    "curl",
    [
      "--fail",
      "--location",
      "--retry",
      "2",
      "--silent",
      "--show-error",
      url,
      "-o",
      temporary,
    ],
    { stdio: "inherit" },
  );
  const data = await readFile(temporary);
  const sha256 = createHash("sha256").update(data).digest("hex");
  if (sha256 !== expectedHashes[name]) {
    await rm(temporary, { force: true });
    throw new Error(
      `Pinned model hash mismatch: ${name}. Existing model was not replaced.`,
    );
  }
  await rename(temporary, target);
  manifest.push({
    name,
    url,
    bytes: data.length,
    sha256,
    retrievedAt: new Date().toISOString(),
    license: "Apache-2.0",
    licenseAudit:
      "Explicit official model-card licence reviewed 2026-11-02; docs/RIGHTS_AUDIT_R06.md and cook/evidence/rights-r06/public-source-evidence.json map bundle constituents and limitations",
  });
}
await writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
// Ship the weights' licence/attribution alongside the actual public model files.
await copyFile(
  path.join(root, "docs/rights/Apache-2.0.txt"),
  path.join(output, "LICENSE"),
);
await copyFile(
  path.join(root, "packages/vision-core/MODEL_NOTICE.md"),
  path.join(output, "NOTICE.md"),
);
const wasmSource = path.join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmOutput = path.join(root, "apps/web/public/wasm");
await mkdir(wasmOutput, { recursive: true });
for (const name of await readdir(wasmSource))
  if (/\.(wasm|js)$/.test(name))
    await copyFile(path.join(wasmSource, name), path.join(wasmOutput, name));
for (const name of ["LICENSE", "NOTICE"]) {
  try {
    await copyFile(
      path.join(root, "node_modules/@mediapipe/tasks-vision", name),
      path.join(wasmOutput, name),
    );
  } catch {
    /* This installed package version may omit an optional NOTICE file. */
  }
}
try {
  await readFile(path.join(wasmOutput, "LICENSE"));
} catch {
  execFileSync(
    "curl",
    [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE",
      "-o",
      path.join(wasmOutput, "LICENSE"),
    ],
    { stdio: "inherit" },
  );
}
console.log(
  "Fetched official face, hair, hand, multiclass body and pose models and copied installed WASM runtime.",
);
