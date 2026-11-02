/** Retain actual upstream notices with the distributed browser artifact. */
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
const destination = "apps/web/public/notices";
await mkdir(destination, { recursive: true });
const sourceNotices = {
  "OpenMakeupSDK-MIT.txt": "packages/shader-library/LICENSE.OpenMakeupSDK",
  "MIROIR-MIT.txt": "packages/skin-engine/LICENSE.MIROIR",
  "Skyn-MIT.txt": "packages/skin-engine/LICENSE.SKYN",
  "Virtual-Makeup-attribution.md": "packages/vision-core/THIRD_PARTY_NOTICE.md",
  "OpenCV-Apache-2.0.txt": "packages/ar-renderer/LICENSE.OpenCV",
  "MediaPipe-models.md": "apps/web/public/models/NOTICE.md",
  "Apache-2.0.txt": "docs/rights/Apache-2.0.txt",
};
for (const [name, path] of Object.entries(sourceNotices))
  await copyFile(path, `${destination}/${name}`);
const libraries = [
  "react",
  "react-dom",
  "three",
  "@react-three/fiber",
  "dexie",
  "dexie-react-hooks",
  "zustand",
  "zod",
  "lucide-react",
  "@mediapipe/tasks-vision",
  "@techstark/opencv-js",
];
const inventory = [];
for (const name of libraries) {
  const base = `node_modules/${name}`,
    pkg = JSON.parse(await readFile(base + "/package.json", "utf8"));
  const label = name.replaceAll("/", "-").replace("@", "");
  let notice = null;
  for (const candidate of ["LICENSE", "LICENSE.txt", "LICENSE.md", "license"]) {
    try {
      await copyFile(
        base + "/" + candidate,
        `${destination}/${label}-LICENSE.txt`,
      );
      notice = label + "-LICENSE.txt";
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!notice && name === "@react-three/fiber" && pkg.version === "9.8.2") {
    await copyFile(
      "docs/rights/R3F-9.8.2-MIT.txt",
      `${destination}/${label}-LICENSE.txt`,
    );
    notice = label + "-LICENSE.txt";
  }
  if (!notice && pkg.license !== "Apache-2.0")
    throw new Error(`Missing distribution notice for ${name}`);
  inventory.push({
    name,
    version: pkg.version,
    declaredLicense: pkg.license,
    notice: notice ?? "Apache-2.0.txt",
  });
}
await writeFile(
  destination + "/inventory.json",
  JSON.stringify(
    {
      libraries: inventory,
      sourceNotices: Object.keys(sourceNotices),
      limitations: [
        "Virtual Makeup standalone full notice is still absent upstream; preserve available declaration without inventing a notice.",
        "This inventory does not clear photograph/model releases, provider-output terms or every transitive dependency.",
      ],
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  destination + "/README.md",
  "# True Beauty third-party notices\n\nActual source and selected runtime dependency notices accompany this browser build. `inventory.json` identifies versions. Source code is adapted and modified by True Beauty; exact paths and pinned commits are in docs/SOURCE_INTEGRATION_MATRIX.md in the source repository. Font notices accompany the fonts; model notices accompany the models.\n\nThe Virtual Makeup full-notice gap remains unresolved and is disclosed in the retained attribution. This file is not a blanket distribution-rights clearance.\n",
);
console.log(
  `Distribution notices retained for ${libraries.length} runtime libraries and four adapted repositories.`,
);
