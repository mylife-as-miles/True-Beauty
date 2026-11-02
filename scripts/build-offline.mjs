import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
const paths = [];
const outputDirectory = process.argv[2] ?? "dist";
async function walk(dir, rel = "") {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const name = rel + "/" + item.name;
    if (item.isDirectory()) await walk(join(dir, item.name), name);
    else if (
      /\.(?:js|css|ttf|woff2|jpg|svg|html)$/.test(item.name) &&
      !name.includes("/wasm/") &&
      !name.includes("opencv") &&
      !name.endsWith("/sw.js")
    )
      paths.push(name);
  }
}
await walk(outputDirectory);
paths.push("/");
const version = createHash("sha256")
  .update(paths.sort().join("\n"))
  .digest("hex")
  .slice(0, 12);
let worker = await readFile("apps/web/public/sw.js", "utf8");
worker = worker
  .replace(
    /const CACHE\s*=\s*['"][^'"]*['"];/,
    `const CACHE='true-beauty-${version}';`,
  )
  .replace(
    /const PRECACHE\s*=\s*\[[\s\S]*?\];/,
    `const PRECACHE=${JSON.stringify(paths)};`,
  );
await writeFile(join(outputDirectory, "sw.js"), worker);
await writeFile(
  join(outputDirectory, "offline-manifest.json"),
  JSON.stringify(
    {
      version,
      paths,
      excluded: [
        "vision model binaries and WASM (runtime cached after first use)",
        "large optional OpenCV runtime",
        "all API responses and personal media",
      ],
    },
    null,
    2,
  ),
);
console.log(
  `Offline shell: ${paths.length} original app resources, version ${version}. No personal or API data precached.`,
);
