import { defineConfig, mergeConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import baseConfig from "../../../vite.config.ts";
import hosting from "../../../.openai/hosting.json";
import { sites } from "./sites-vite-plugin.ts";

// These placeholders are only for the local build/preview. Sites owns the
// production resource identity and replaces the declared logical DB binding.
const placeholderDatabaseId = "00000000-0000-4000-8000-000000000000";

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      sites({ mockAuth: false }),
      cloudflare({
        viteEnvironment: { name: "server" },
        inspectorPort: false,
        config: {
          name: "true-beauty",
          main: "./apps/edge/src/worker.ts",
          compatibility_date: "2026-05-15",
          compatibility_flags: ["nodejs_compat"],
          assets: {
            binding: "ASSETS",
            not_found_handling: "single-page-application",
            run_worker_first: ["/api/*"],
          },
          d1_databases: hosting.d1
            ? [
                {
                  binding: hosting.d1,
                  database_name: "site-creator-d1",
                  database_id: placeholderDatabaseId,
                },
              ]
            : [],
        },
      }),
    ],
  }),
);
