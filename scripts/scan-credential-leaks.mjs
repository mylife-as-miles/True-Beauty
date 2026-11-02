/** Operator verification: secret candidates arrive only through hidden stdin. */
import { createInterface } from "node:readline";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { execFileSync, spawn } from "node:child_process";
const reader = createInterface({ input: process.stdin, terminal: false });
process.stdout.write("Ready for credential candidates JSON on hidden stdin.\n");
const candidates = JSON.parse(
  await new Promise((resolve) => reader.once("line", resolve)),
);
reader.close();
if (
  !Array.isArray(candidates) ||
  !candidates.length ||
  candidates.some((v) => typeof v !== "string" || v.length < 20)
)
  throw new Error("A nonempty array of credential candidates is required.");
const needles = candidates.flatMap((value) => [
  Buffer.from(value),
  Buffer.from(Buffer.from(value).toString("base64")),
]);
if (
  typeof process.env.GH_TOKEN === "string" &&
  process.env.GH_TOKEN.length >= 20
)
  needles.push(Buffer.from(process.env.GH_TOKEN));
const allowed = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".txt",
  ".yaml",
  ".yml",
  ".html",
  ".css",
]);
const exclude = (name) =>
  ["node_modules", ".git", ".runtime", "playwright-report"].includes(name) ||
  name.startsWith("test-results");
let files = 0;
const matches = [];
async function visit(path) {
  const info = await stat(path).catch(() => null);
  if (!info) return;
  if (info.isDirectory()) {
    for (const e of await readdir(path, { withFileTypes: true })) {
      if (!exclude(e.name) && !e.isSymbolicLink())
        await visit(join(path, e.name));
    }
  } else if (allowed.has(extname(path)) || path.endsWith(".env.example")) {
    files++;
    const bytes = await readFile(path);
    if (needles.some((v) => bytes.includes(v))) matches.push(path);
  }
}
for (const path of [
  "apps",
  "packages",
  "scripts",
  "tests",
  "docs",
  ".openai",
  "dist",
  "README.md",
  ".env.example",
  "cook",
])
  await visit(path);
const objects = execFileSync("git", ["rev-list", "--objects", "--all"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
})
  .trim()
  .split("\n")
  .filter(Boolean);
const objectPaths = new Map(
  objects.map((line) => {
    const space = line.indexOf(" ");
    return [
      space < 0 ? line : line.slice(0, space),
      space < 0 ? "(git object)" : line.slice(space + 1),
    ];
  }),
);
let historyBlobs = 0;
const historyMatches = [];
await new Promise((resolve, reject) => {
  const child = spawn("git", ["cat-file", "--batch"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = Buffer.alloc(0),
    header = null;
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (!header) {
        const end = buffer.indexOf(10);
        if (end < 0) break;
        const [oid, type, size] = buffer.subarray(0, end).toString().split(" ");
        header = { oid, type, size: Number(size) };
        buffer = buffer.subarray(end + 1);
        if (!Number.isFinite(header.size)) {
          reject(new Error("Invalid Git object header"));
          child.kill();
          return;
        }
      }
      if (buffer.length < header.size + 1) break;
      const content = buffer.subarray(0, header.size);
      if (header.type === "blob") {
        historyBlobs++;
        if (needles.some((value) => content.includes(value)))
          historyMatches.push({
            oid: header.oid,
            path: objectPaths.get(header.oid),
          });
      }
      buffer = buffer.subarray(header.size + 1);
      header = null;
    }
  });
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error("Git history scan failed")),
  );
  child.stdin.end([...objectPaths.keys()].join("\n") + "\n");
});
console.log(
  JSON.stringify({
    filesScanned: files,
    historyBlobsScanned: historyBlobs,
    credentialMatches: matches.length + historyMatches.length,
    paths: matches,
    historyMatches,
  }),
);
if (matches.length || historyMatches.length) process.exitCode = 1;
