/** Package a committed Sites Worker build without changing the build directory. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  cp,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const [archiveArgument, ...extra] = process.argv.slice(2);
assert.ok(
  archiveArgument && isAbsolute(archiveArgument) && extra.length === 0,
  "Usage: node scripts/package-hosted.mjs /absolute/path/release.tar[.gz]",
);
const archive = resolve(archiveArgument);
assert.ok(
  archive !== root && !archive.startsWith(root + sep),
  "Keep publication archives outside the source checkout.",
);
assert.ok(
  /\.(?:tar|tgz|tar\.gz)$/.test(archive),
  "Use a .tar, .tgz or .tar.gz archive path.",
);

async function command(executable, args, cwd = root) {
  const child = spawn(executable, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", accept);
  });
  if (code !== 0)
    throw new Error(`${executable} failed (${code}): ${stderr.trim()}`);
  return stdout.trim();
}
async function cleanSource() {
  const dirty = await command("git", [
    "status",
    "--porcelain",
    "--untracked-files=normal",
  ]);
  assert.equal(
    dirty,
    "",
    "Commit or ignore the current source changes before packaging a publication.",
  );
  const sha = await command("git", ["rev-parse", "HEAD"]);
  assert.match(
    sha,
    /^[0-9a-f]{40}$/,
    "The source commit must have a full Git SHA.",
  );
  return sha;
}
async function sha256(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
const json = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));
const commitSHA = await cleanSource();
const sourceManifest = await json(".openai/hosting.json");
const builtManifest = await json("dist/.openai/hosting.json");
assert.deepEqual(
  builtManifest,
  sourceManifest,
  "The built hosting manifest is stale.",
);
assert.ok(
  sourceManifest.project_id && !sourceManifest.static,
  "This command packages an existing Worker Site.",
);
assert.equal(sourceManifest.d1, "DB");
assert.equal(sourceManifest.r2, null);
const workerConfig = await json("dist/server/wrangler.json");
assert.equal(workerConfig.assets?.binding, "ASSETS");
assert.equal(workerConfig.assets?.directory, "../client");
assert.deepEqual(workerConfig.assets?.run_worker_first, ["/api/*"]);
assert.ok(
  workerConfig.d1_databases?.some((database) => database.binding === "DB"),
);
const serverDirectory = resolve(root, "dist/server");
const entrypoint = resolve(serverDirectory, workerConfig.main ?? "");
assert.ok(
  entrypoint.startsWith(serverDirectory + sep) &&
    [".js", ".mjs"].includes(extname(entrypoint)),
  "The generated Worker entry must be a JavaScript module inside dist/server.",
);
assert.ok(
  (await lstat(entrypoint)).isFile(),
  "The generated Worker entry is missing.",
);
const viteManifest = await json("dist/server/.vite/manifest.json");
assert.ok(
  Object.values(viteManifest).some(
    (entry) =>
      entry.isEntry && resolve(serverDirectory, entry.file) === entrypoint,
  ),
  "The Wrangler entry does not match the generated Vite entry.",
);
await access(resolve(root, "dist/client/index.html"));
await access(resolve(root, "dist/client/offline-manifest.json"));
const journal = await json("drizzle/meta/_journal.json");
assert.equal(journal.dialect, "sqlite");
assert.ok(journal.entries.length > 0);
assert.deepEqual(
  await json("dist/.openai/drizzle/meta/_journal.json"),
  journal,
);
for (const entry of journal.entries) {
  assert.match(entry.tag, /^[a-zA-Z0-9_-]+$/);
  for (const migrationFile of [
    `${entry.tag}.sql`,
    `meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`,
  ]) {
    assert.equal(
      await sha256(resolve(root, "drizzle", migrationFile)),
      await sha256(resolve(root, "dist/.openai/drizzle", migrationFile)),
      "A built migration or snapshot differs from source.",
    );
  }
}

// Explicitly enumerate files and refuse links or local secret files so copying
// cannot follow unrelated local content into a publication artifact.
const inputs = [
  ["dist/.openai", ".openai"],
  ["dist/server", "dist/server"],
  ["dist/client", "dist/client"],
  ["drizzle", "drizzle"],
];
const inventory = [];
async function collect(source, target) {
  const information = await lstat(source);
  assert.ok(
    !information.isSymbolicLink(),
    `Symlinks are not publication artifacts: ${target}`,
  );
  if (information.isDirectory()) {
    for (const name of (await readdir(source)).sort()) {
      assert.ok(
        !/^\.env(?:\.|$)|^\.dev\.vars(?:\.|$)/.test(name),
        `Local secret file in artifact: ${name}`,
      );
      await collect(resolve(source, name), `${target}/${name}`);
    }
  } else {
    assert.ok(information.isFile(), `Unsupported artifact file: ${target}`);
    inventory.push({
      path: target,
      size: information.size,
      sha256: await sha256(source),
    });
  }
}
for (const [source, target] of inputs)
  await collect(resolve(root, source), target);
assert.ok(inventory.some((file) => file.path === ".openai/hosting.json"));
await mkdir(dirname(archive), { recursive: true });
try {
  await access(archive);
  throw new Error(
    "The destination archive already exists; choose a fresh path.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const stage = await mkdtemp(resolve(dirname(archive), ".tb-hosted-package-"));
const partial = archive + ".partial-" + randomUUID();
try {
  for (const [source, target] of inputs)
    await cp(resolve(root, source), resolve(stage, target), {
      recursive: true,
    });
  for (const file of inventory) {
    assert.equal(
      await sha256(resolve(stage, file.path)),
      file.sha256,
      "Build output changed while packaging.",
    );
  }
  await command(
    "tar",
    [
      /\.(?:tgz|tar\.gz)$/.test(archive) ? "-czf" : "-cf",
      partial,
      ".openai",
      "dist/server",
      "dist/client",
      "drizzle",
    ],
    stage,
  );
  const contents = (await command("tar", ["-tf", partial], stage))
    .split("\n")
    .filter(Boolean);
  assert.ok(contents.includes(".openai/hosting.json"));
  assert.ok(
    contents.includes(
      "dist/server/" +
        relative(serverDirectory, entrypoint).split(sep).join("/"),
    ),
  );
  assert.ok(contents.includes("dist/client/index.html"));
  assert.ok(contents.includes("drizzle/meta/_journal.json"));
  assert.ok(contents.includes(".openai/drizzle/meta/_journal.json"));
  assert.equal(
    await cleanSource(),
    commitSHA,
    "The source commit changed while packaging.",
  );
  const archiveSHA256 = await sha256(partial);
  // Hard-link finalization refuses to overwrite a prior immutable archive.
  await link(partial, archive);
  await unlink(partial);
  console.log(
    JSON.stringify(
      {
        project_id: sourceManifest.project_id,
        commit_sha: commitSHA,
        archive,
        archive_sha256: archiveSHA256,
        archive_bytes: (await lstat(archive)).size,
        files: inventory.length,
        worker_entrypoint:
          "dist/server/" +
          relative(serverDirectory, entrypoint).split(sep).join("/"),
        worker_sha256: await sha256(entrypoint),
        migrations: journal.entries.map((entry) => entry.tag),
        artifact_inventory_sha256: createHash("sha256")
          .update(JSON.stringify(inventory))
          .digest("hex"),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(stage, { recursive: true, force: true });
  await rm(partial, { force: true });
}
