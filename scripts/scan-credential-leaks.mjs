/** Operator verification: secret candidates arrive only through hidden stdin. */
import { createInterface } from "node:readline";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
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
  "cook/BRIEF.md",
  "cook/ROUNDS.md",
  "cook/SCORECARD.md",
])
  await visit(path);
console.log(
  JSON.stringify({
    filesScanned: files,
    credentialMatches: matches.length,
    paths: matches,
  }),
);
if (matches.length) process.exitCode = 1;
