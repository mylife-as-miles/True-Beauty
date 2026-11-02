import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: "apps/web/public",
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      ignored: [
        "**/test-results*/**",
        "**/playwright-report/**",
        "**/cook/**",
        "**/dist/**",
      ],
    },
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 700 },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
