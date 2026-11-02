import { test, expect, type Page } from "@playwright/test";

async function openRemix(page: Page) {
  await page.goto("/");
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("button", { name: "Look Remix", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "A mood. Made yours.", exact: true }),
  ).toBeVisible();
}
async function interpret(page: Page) {
  await page
    .getByRole("button", { name: "Interpret this reference", exact: true })
    .click();
  await expect(page.locator(".look-remix")).toHaveAttribute(
    "data-remix-phase",
    "ready",
    { timeout: 45000 },
  );
}

test("Look Remix measures image regions, edits the derived look, and applies it without replacing the target portrait", async ({
  page,
}, info) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await openRemix(page);
  const original = await page
    .locator(".remix-target-original")
    .getAttribute("src");
  await interpret(page);
  await expect(
    page.getByRole("heading", { name: "The colours we found.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".remix-target-stage canvas")).toHaveAttribute(
    "data-rendered",
    "aligned",
    { timeout: 30000 },
  );
  await expect(page.locator(".remix-inspector")).toContainText(
    "sample quality",
  );
  await page
    .getByLabel("Lips colour correction", { exact: true })
    .fill("#943356");
  await page.getByLabel("Lips finish", { exact: true }).selectOption("gloss");
  await expect(page.locator(".remix-inspector")).toContainText(
    "Your choice · measured",
  );
  await page
    .getByRole("button", { name: "Apply this interpretation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Applied to your mirror", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".remix-target-original")).toHaveAttribute(
    "src",
    original!,
  );
  await page.getByLabel("Compare", { exact: true }).check();
  await page
    .getByRole("slider", {
      name: "Original and interpretation split",
      exact: true,
    })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("slider", {
      name: "Original and interpretation split",
      exact: true,
    }),
  ).toHaveValue("51");
  await page.screenshot({
    path: info.outputPath("derived-look.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "See it in my mirror", exact: true })
    .click();
  await expect(
    page.getByLabel("Custom makeup colour", { exact: true }),
  ).toHaveValue("#943356");
  await expect(
    page.getByRole("button", { name: "Glossy", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".mirror-media canvas")).toHaveAttribute(
    "data-source-url",
    original!,
  );
  expect(posts).toEqual([]);
});

test("a private image without a face remains palette-only with no photo upload or database retention", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await openRemix(page);
  const buffer = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 600;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#51807d";
    context.fillRect(0, 0, 480, 600);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Inspiration photograph", { exact: true })
    .setInputFiles({
      name: "private-r06-reference.png",
      mimeType: "image/png",
      buffer: Buffer.from(buffer, "base64"),
    });
  await interpret(page);
  await expect(
    page.getByRole("heading", {
      name: "A palette, without a face.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".remix-region-tabs")).toContainText("Not sampled");
  await expect(
    page.getByRole("button", {
      name: "Apply this interpretation",
      exact: true,
    }),
  ).toBeDisabled();
  const records = await page.evaluate(async () => {
    const modulePath = "/packages/local-database/src/index.ts";
    const { db } = await import(modulePath);
    return JSON.stringify(
      await Promise.all(
        db.tables.map(
          async (table: {
            name: string;
            toArray: () => Promise<unknown[]>;
          }) => ({
            name: table.name,
            rows: await table.toArray(),
          }),
        ),
      ),
    );
  });
  expect(records).not.toContain("private-r06-reference.png");
  expect(records).not.toContain("blob:");
  expect(records).not.toContain("data:image/png");
  expect(posts).toEqual([]);
});

test("a selected region receives a deliberately chosen palette shade and preserves original measurement evidence", async ({
  page,
}) => {
  await openRemix(page);
  await interpret(page);
  await page.getByRole("button", { name: /^Eyelids/ }).click();
  const swatch = page
    .getByRole("button", {
      name: /^Use palette colour #[\da-f]{6} for eyelids$/,
    })
    .first();
  const label = await swatch.getAttribute("aria-label"),
    color = label!.match(/#[\da-f]{6}/i)![0];
  await swatch.click();
  await expect(
    page.getByLabel("Eyelids colour correction", { exact: true }),
  ).toHaveValue(color);
  await expect(page.locator(".remix-inspector")).toContainText(
    "Your choice · measured",
  );
  await page
    .getByRole("button", { name: "Apply this interpretation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "See it in my mirror", exact: true })
    .click();
  await page.getByRole("button", { name: "Eyeshadow", exact: true }).click();
  await expect(
    page.getByLabel("Custom makeup colour", { exact: true }),
  ).toHaveValue(color);
});

test.describe("unavailable local model boundary", () => {
  test.use({ serviceWorkers: "block" });
  test("unavailable local models produce an honest whole-image palette and original target preview", async ({
    page,
  }) => {
    await page.context().route("**/models/**", (route) => route.abort());
    await openRemix(page);
    await interpret(page);
    await expect(
      page.getByRole("heading", {
        name: "A palette, without a face.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Apply this interpretation",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByText("How this interpretation was made", { exact: true })
      .click();
    await expect(page.locator(".remix-evidence")).toContainText(
      "Local tracking unavailable",
    );
    await expect(page.locator(".remix-palette")).toContainText(
      "Whole-image palette",
    );
  });
});
