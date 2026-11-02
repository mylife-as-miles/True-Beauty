import { defineConfig, devices } from "@playwright/test";
const production = process.env.TB_E2E_PRODUCTION === "1";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  use: {
    baseURL: production ? "http://127.0.0.1:4173" : "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: production
      ? "npm run build && npm run preview -- --port 4173"
      : "npm run dev",
    url: production ? "http://127.0.0.1:4173" : "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    ...(process.env.TB_CROSS_BROWSER === "1"
      ? [
          {
            name: "firefox",
            use: {
              ...devices["Desktop Firefox"],
              headless: process.env.TB_FIREFOX_HEADED !== "1",
              launchOptions: {
                firefoxUserPrefs: {
                  "webgl.force-enabled": true,
                  "webgl.disabled": false,
                  "gfx.webrender.software": true,
                },
              },
            },
          },
        ]
      : []),
    ...(process.env.TB_WEBKIT === "1"
      ? [
          {
            name: "webkit",
            use: {
              ...devices["Desktop Safari"],
              launchOptions: {
                executablePath: process.env.TB_WEBKIT_EXECUTABLE || undefined,
              },
            },
          },
        ]
      : []),
  ],
});
