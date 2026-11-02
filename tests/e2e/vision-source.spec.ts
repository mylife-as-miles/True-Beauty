import { test, expect } from "@playwright/test";
test.use({ serviceWorkers: "block" });
test("uploaded portrait waits for pending real model work and receives its own landmarks", async ({
  page,
  context,
}, info) => {
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    requestStarted = new Promise<void>((r) => {
      started = r;
    });
  await context.route("**/models/face_landmarker.task", async (route) => {
    started();
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await requestStarted;
  await page
    .locator('.source-bar input[type="file"]')
    .setInputFiles("apps/web/public/images/portrait-2.jpg");
  await expect(page.locator(".mirror-label")).toContainText("Your photo");
  await expect(page.locator(".mirror-state")).not.toContainText(
    "No face found",
  );
  release();
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 30000 },
  );
  await expect(page.locator(".mirror-footnote")).toContainText(/\d+ ms/);
  await page.screenshot({
    path: `cook/stills/r03/source-queue-${info.project.name}.png`,
  });
});
