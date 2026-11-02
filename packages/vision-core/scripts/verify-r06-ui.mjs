import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  origin = process.argv[2] ?? "http://127.0.0.1:5173",
  out = path.join(root, "cook/stills/r06-accessories");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      }),
      page = await context.newPage(),
      posts = [];
    context.on("request", (r) => {
      if (r.method() === "POST") posts.push(r.url());
    });
    await page.goto(origin);
    await page
      .locator(".mirror-state")
      .filter({ hasText: "Face mesh connected" })
      .waitFor({ timeout: 45000 });
    await page
      .getByRole("button", { name: "Show full portrait", exact: true })
      .click();
    await page.getByRole("button", { name: "Style", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "Preview watch", exact: true })
      .check();
    await page
      .getByRole("status", { name: "Accessory tracking status" })
      .filter({ hasText: "anchor available" })
      .waitFor({ timeout: 30000 });
    const overlap = page.getByRole("checkbox", {
      name: "Enhanced overlap detail",
      exact: true,
    });
    await overlap.focus();
    await page.keyboard.press("Space");
    await page
      .getByRole("status", { name: "Optional vision unavailable" })
      .waitFor({ state: "detached" });
    const resultsAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    await page
      .getByRole("button", { name: "Accessory tracking details", exact: true })
      .click();
    const keyboard = await page
      .locator("#accessory-tracking-details")
      .evaluate((e) => ({
        focused: document.activeElement === e,
        outline: getComputedStyle(e).outlineStyle,
      }));
    const frameHeight = (await page.locator(".mirror-frame").boundingBox())
      .height;
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await page.screenshot({
      path: path.join(out, `style-axe-${viewport.width}.png`),
      fullPage: true,
    });
    await page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === "/apps/web/src/state/store.ts");
      const { useApp } = await import(/* @vite-ignore */ url);
      useApp.getState().setGeneratedPortrait("/images/portrait-2.jpg", {
        kind: "ai-generated",
        provider: "perfect-corp",
        feature: "hair",
        createdAt: "2026-11-02T14:00:00Z",
      });
    });
    const badge = page.getByRole("note", {
      name: "Generated image provenance",
    });
    await badge.waitFor();
    const b = await badge.boundingBox(),
      z = await page.locator(".mirror-side").boundingBox(),
      restore = await page
        .getByRole("button", { name: "Restore original photo" })
        .boundingBox();
    const overlapsZoom =
      b.x < z.x + z.width &&
      b.x + b.width > z.x &&
      b.y < z.y + z.height &&
      b.y + b.height > z.y;
    const generatedAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    await page.screenshot({
      path: path.join(out, `generated-axe-${viewport.width}.png`),
      fullPage: true,
    });
    results.push({
      viewport,
      style: {
        violations: resultsAxe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
        keyboard,
        frameHeight,
        overflow,
      },
      generated: {
        violations: generatedAxe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
        badgeOverlapsZoom: overlapsZoom,
        restoreTarget: restore,
      },
      posts,
    });
    await context.close();
  }
  await writeFile(
    path.join(out, "accessibility-layout-evidence.json"),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        browser: browser.version(),
        results,
        limits:
          "Viewport emulation and automated WCAG rules are not physical-device, screen-reader or full accessibility certification. Generated metadata is an explicit contract fixture, not a live provider call.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
  if (
    results.some(
      (r) =>
        r.style.violations.length ||
        r.generated.violations.length ||
        !r.style.keyboard.focused ||
        r.style.keyboard.outline === "none" ||
        r.style.frameHeight < 200 ||
        r.style.overflow ||
        r.generated.badgeOverlapsZoom ||
        r.generated.restoreTarget.height < 44 ||
        r.posts.length,
    )
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
