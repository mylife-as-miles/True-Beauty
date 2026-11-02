# Sites Worker build and asset proof — round07

Current deployment reconciliation: native public version5 and scoped genuine hosted verification are recorded in DEPLOYMENT.md and LIVE_PROVIDER_VERIFICATION_R07.md. Local fixture proofs below remain separate from those public results; earlier implementation-checkpoint limits are historical.


The existing Vite SPA can share a supported Cloudflare Worker artifact with the native API. A real local Wrangler/workerd fixture passed ten checks using the generated deployment configuration without rewriting it. This is build/runtime evidence; this document does not claim a production deployment or successful provider request.

## Verified integration

The [Sites skill](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/SKILL.md), [static-to-Worker guidance](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/references/troubleshooting.md), [storage contract](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/references/storage.md) and [Vinext starter README](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/templates/vinext-starter/README.md) were read for this work. The dependency-free Worker ESM starter explicitly copies only its Worker entry and manifest and forbids standalone assets. It cannot carry this application's existing models, WASM, fonts and SPA unchanged.

`apps/edge/build/vite.hosted.config.mjs` retains the application's Vite React/Tailwind configuration and adds the starter's Cloudflare Vite integration and maintained `sites()` integration. The vendored `sites-vite-plugin.ts` is the existing MIT-licensed `@openai/sites-vite-plugin` 0.2.0 copy from the researched Common Table source; its license accompanies the file. No Fastify adapter, unsafe-eval capability, filesystem asset shim or invented `ASSETS` service is used.

The Cloudflare plugin declares a standard Worker assets binding and generates its deployment metadata:

```json
{
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"],
  "directory": "../client"
}
```

The Worker entry is `apps/edge/src/worker.ts`; `DB` is the logical D1 binding. The `00000000-0000-4000-8000-000000000000` database ID is the starter's local placeholder. Sites owns the hosted database identity. No R2 binding is declared. Runtime credentials belong in native Sites secret settings, never in this manifest or Vite's public environment.

The source hosting manifest must preserve `project_id: appgprj_6ae88d68c5bc81918175edf22df8b3b5`, remove `static`, declare `d1: "DB"` and set `r2: null`. The public audience must be preserved by the publication owner.

## Build and archive layout

Run `node scripts/build-hosted.mjs` after production Worker/schema source is ready and the pinned build dependencies are installed. The script validates bindings, generated migration metadata and tooling versions, checks TypeScript, builds notices, clears generated output, builds both Vite environments and generates the offline shell in `dist/client`. The existing `npm run build` and default `node scripts/build-offline.mjs` retain their static `dist` behavior.

The generated layout is:

```text
dist/
├── .openai/
│   ├── hosting.json
│   └── drizzle/
│       ├── 0000_<generated-name>.sql
│       └── meta/
│           ├── _journal.json
│           └── 0000_snapshot.json
├── client/
│   ├── index.html
│   ├── assets/
│   ├── models/, wasm/, fonts/, notices/, ...
│   ├── sw.js
│   └── offline-manifest.json
└── server/
    ├── index.js (or index.mjs, according to package module type)
    ├── wrangler.json
    └── .vite/manifest.json
```

The Worker entry extension is read from the emitted `wrangler.json.main`, not assumed. Production source is an ES module package. The manifest is copied by `sites()` to `dist/.openai/hosting.json`, along with the complete root `drizzle/` directory. The plugin emits the actual `ASSETS` binding, `../client` directory and D1 binding into `dist/server/wrangler.json`.

This is the build layout, not an instruction to archive the entire repository. The native version-saving tool requires `.openai/hosting.json` at the **archive root** and the built Worker/client output. When the source helper is unavailable, the retained Common Table release packager provides a prior implementation pattern: transform only `dist/.openai` to archive-root `.openai`, retain `dist/server` and `dist/client`, and include root `drizzle/` as well as `.openai/drizzle/`. Its migration-discovery note explicitly retains the root schema directory. The publication owner must verify the final archive against the same pushed source commit and verify hosted schema readiness separately; local artifact success alone does not establish that the platform applied migrations.

## Exact tooling versions

The fixture used Vite **7.3.7**, `@cloudflare/vite-plugin` **1.37.1**, Wrangler **4.92.0**, Drizzle Kit **0.31.10** and Drizzle ORM **0.45.2**. These match the supported starter's Cloudflare integration and retain the application's existing Vite major. The Cloudflare plugin explicitly supports Vite 6, 7 and 8.

The generated configuration includes `legacy_env`, which unrelated newer Wrangler 4.156.1 rejects. The matched Wrangler 4.92.0 parses it and runs the artifact. Its workerd supports dates through 2026-05-22; this build uses the starter's **2026-05-15** compatibility date with `nodejs_compat`. A first fixture attempt with the R06 experiment's 2026-11-01 date correctly failed. No generated field was deleted to force compatibility.

The minimal build additions are pinned `@cloudflare/vite-plugin@1.37.1`, `wrangler@4.92.0`, `drizzle-kit@0.31.10` and `drizzle-orm@0.45.2`. The generated migration SQL, snapshots and journal must be committed with the source. Tables are never created in request handlers.

## Actual local evidence

`apps/edge/build/run-hosting-probe.mjs` creates an isolated throwaway fixture under the supplied tooling directory. It generates a real Drizzle table migration and snapshot, runs the real Vite/Cloudflare/Sites build, applies the emitted migration through Wrangler's local D1 command, inserts synthetic test data outside the migration, then starts the emitted Worker in actual workerd. It does not call the deployment CLI or native Sites tools, access credentials, send an image or contact a paid provider.

`apps/edge/build/hosting-workerd-evidence.json` records ten passing checks: generated binding/directory/D1 metadata; journal and snapshot propagation; local D1 migration; an actual API read of migrated D1; a standalone representative SVG; SPA deep-link fallback; and JSON 404 behavior for an unknown API route. The asset's recorded SHA-256 is retained for attribution of the tested bytes. The SVG is authored synthetic markup, not a user image.

Reproduce with isolated tooling outside the application dependency graph:

```sh
npm install --prefix /workspace/research/edge-r06-tooling --no-audit --no-fund @cloudflare/vite-plugin@1.37.1 vite@7.3.7 drizzle-kit@0.31.10 drizzle-orm@0.45.2
node apps/edge/build/run-hosting-probe.mjs /workspace/research/edge-r06-tooling
```

The script selects the Wrangler installed with the Cloudflare integration. The previous R06 probes may continue using their separate Wrangler 4.156.1; their generated ad hoc experiment configuration is a distinct contract. The optional offline output argument was also executed against the fixture: precache paths remained `/assets/...`, `/index.html`, `/representative.svg` and `/`, with no `/client`, `/server` or migration paths.

Root owns the full native API integration, production secrets, migrated schema reconciliation, same-project publication and hosted verification. The local fixture does not verify dispatch identity-header provenance, hosted D1 migration application, provider execution, public authorization, cancellation behavior or production resource limits. Those gates require the actual integrated Worker and deployment evidence.

## Reusable publication packager

`node scripts/package-hosted.mjs /absolute/path/release.tar.gz` packages an existing successful build without modifying `dist`. Use `.tar`, `.tgz` or `.tar.gz` and a fresh destination outside the source checkout. The script requires a clean committed source tree, checks the full Git SHA, compares source/built hosting manifests and every migration/snapshot hash, and checks the generated Worker entry against Vite's entry manifest. It refuses symlinks and local environment/secret files, stages only the deployment trees outside the checkout, verifies the copied bytes, and produces archive-root `.openai/`, `dist/server/`, `dist/client/` and root `drizzle/`. Output includes the absolute archive path, source SHA, archive SHA-256/size, Worker SHA-256, migration tags and a file-inventory digest. It does not push, deploy, initialize a database or claim that an archive was built from a remote commit; the publisher must push that exact committed source and retain the matching build.

The packager was executed against an isolated temporary Git fixture containing byte copies of the actual R07 production build, manifest and both migrations. Its synthetic fixture commit is not a publication source commit. The `.tar.gz` contained **108 files**, measured **45,685,348 bytes**, and passed its archive entry, migration, copy-integrity and Worker-entry checks. Tested Worker SHA-256: `b2d78eeb39ff984da497df66f9b842814f065949f31e86d194e6a050849eea6e`. This fixture's archive SHA-256 is `f81697c6eec484a5c55b46cacacfdd8b6521ba125eec4e71d4e6b6de4ac71cac`; the actual publication archive will have its own source commit and digest. The full app build was not rebuilt or edited during this packaging check. Targeted ESLint passed for the packager.
