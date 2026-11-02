import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
async function goSkin(page: Page) {
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i, exact: true }),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .locator(".nav-rail")
      .getByRole("button", { name: "Skin & rituals", exact: true })
      .click();
  } else
    await page
      .locator(".topnav")
      .getByRole("button", { name: "Skin & rituals", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "Skin, understood." }),
  ).toBeVisible();
}
async function goJournal(page: Page) {
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Beauty journal", exact: true })
    .click();
}
test("real local colour inference, consented history persistence and deletion", async ({
  page,
}, testInfo) => {
  const paidRequests: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/skin\/tasks/.test(r.url()))
      paidRequests.push(r.url());
  });
  await page.goto("/");
  await goSkin(page);
  await expect(
    page.getByText("Swatches are starting examples until"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Read my colours locally", exact: true })
    .click();
  await expect(
    page.getByText("Photo-based colour suggestion", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect(
    page.getByText("Heuristic confidence", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No clinical skin type or phototype is inferred."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save observation", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Save this observation to my local history. No photograph.",
    })
    .check();
  await page
    .getByRole("button", { name: "Save observation", exact: true })
    .click();
  await expect(
    page.getByText(
      "Observation saved locally. Your photograph was not stored.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Your history", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Colour observation", exact: true }),
  ).toBeVisible();
  mkdirSync("cook/stills/skin", { recursive: true });
  await page.screenshot({
    path: `cook/stills/skin/history-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await goSkin(page);
  await page.getByRole("button", { name: "Your history", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Colour observation", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Delete observation from/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your history starts with your choice.",
    }),
  ).toBeVisible();
  expect(paidRequests).toHaveLength(0);
});
test("self-reported corrections create a real budget routine and journal completion", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await goSkin(page);
  await page.getByRole("button", { name: "Skin & care", exact: true }).click();
  await page
    .getByLabel("Your skin type, as you describe it")
    .selectOption("dry");
  await page.getByRole("checkbox", { name: "Feels dry", exact: true }).check();
  await page.getByLabel("Routine budget in NGN").fill("35000");
  await page
    .getByRole("button", { name: "Save my preferences", exact: true })
    .click();
  await expect(
    page.getByText("Your self-reported preferences were saved locally."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Build my routine", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your daily ritual", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".skin-routine-header")).toContainText("₦29,500");
  await page
    .getByRole("button", { name: "Save both routines", exact: true })
    .click();
  await expect(
    page.getByText("Morning and evening routines saved to your journal."),
  ).toBeVisible();
  await goJournal(page);
  await page
    .getByRole("button", { name: "Daily rituals", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My morning ritual", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark today complete", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Completed today", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `cook/stills/skin/routines-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
test("manual swatches work without inference and remote availability is truthful", async ({
  page,
}, testInfo) => {
  // This case exercises an unavailable deployment, independent of an operator's
  // separately authorized live provider configuration.
  await page.route('**/api/capabilities', route => route.fulfill({json:{skinAnalysis:{configured:false,paidEnabled:false,pricingPlanConfigured:false,status:'unavailable',allowedActions:[],liveVerified:false}}}));
  await page.goto("/");
  await goSkin(page);
  await page.getByLabel("Correct skin colour").fill("#82543a");
  await expect(
    page.getByText("Your corrected swatches", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skin & care", exact: true }).click();
  await expect(
    page.getByText("Not connected. Genuine concern scores"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Authorize and send portrait",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `cook/stills/skin/care-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("a camera permission result arriving after leaving Skin Lab stops its live track", async ({
  page,
}) => {
  // Install in the current document before explicit camera access so the
  // fixture is independent of pre-document media-wrapper initialization.
  await page.goto("/");
  await page.evaluate(() => {
    const state = { stopCount: 0, resolved: false, calls: 0 };
    // Retain the IDL wrapper while model allocation runs. A weakly-held WebKit
    // media wrapper can otherwise lose a per-instance fixture override.
    const mediaDevices = navigator.mediaDevices;
    Object.assign(window, {
      __skinCameraTest: state,
      __skinCameraDevices: mediaDevices,
    });
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      writable: true,
      value: () =>
        new Promise<MediaStream>((resolve) => {
          state.calls++;
          Object.assign(window, {
            __resolveSkinCamera: () => {
              const track = {
                readyState: "live",
                enabled: true,
                stop() {
                  this.readyState = "ended";
                  state.stopCount++;
                },
              };
              state.resolved = true;
              resolve({
                getTracks: () => [track],
                getVideoTracks: () => [track],
              } as unknown as MediaStream);
            },
          });
        }),
    });
  });
  await goSkin(page);
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Opening camera…", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to your mirror", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little more you." }),
  ).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { __resolveSkinCamera: () => void }
    ).__resolveSkinCamera();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __skinCameraTest: { stopCount: number } })
            .__skinCameraTest.stopCount,
      ),
    )
    .toBe(1);
  await expect(
    page.getByRole("heading", { name: "A little more you." }),
  ).toBeVisible();
});

test("Skin Lab preserves a USD profile and never relabels its budget as NGN", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i, exact: true }),
  ).toBeVisible();
  const settings = async () => {
    const profile = page.getByRole("button", {
      name: "Your profile and privacy",
      exact: true,
    });
    if (await profile.isVisible()) await profile.click();
    else {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Privacy and settings", exact: true })
        .click();
    }
    await page
      .getByRole("tab", { name: "Beauty profile", exact: true })
      .click();
  };
  await settings();
  await page.getByLabel("Product budget", { exact: true }).fill("100");
  await page.locator(".profile-form select[name=currency]").selectOption("USD");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Your local profile was updated", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  // A mobile settings entry leaves the navigation menu open until another space is chosen.
  if (
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
  await goSkin(page);
  await page.getByRole("button", { name: "Skin & care", exact: true }).click();
  await expect(page.getByLabel("Budget currency", { exact: true })).toHaveValue(
    "USD",
  );
  await expect(
    page.getByLabel("Routine budget in USD", { exact: true }),
  ).toHaveValue("100");
  await page
    .getByRole("button", { name: "Save my preferences", exact: true })
    .click();
  await expect(
    page.getByText("Your self-reported preferences were saved locally."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Build my routine", exact: true })
    .click();
  await expect(page.locator(".skin-routine-header")).toContainText("$48.00");
  await expect(page.locator(".skin-routine-header")).toContainText(
    "no exchange conversion",
  );
  await settings();
  await expect(page.locator(".profile-form select[name=currency]")).toHaveValue(
    "USD",
  );
  await expect(page.getByLabel("Product budget", { exact: true })).toHaveValue(
    "100",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  if (
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
  await page.getByLabel("Budget currency", { exact: true }).selectOption("GBP");
  await page
    .getByRole("button", { name: "Build my routine", exact: true })
    .click();
  await expect(page.locator(".skin-routine-header")).toContainText(
    "No GBP catalogue prices selected",
  );
  await expect(page.locator(".skin-routine-header")).not.toContainText("£0");
});

test("a delayed local inspection cannot apply an old portrait result over a newer source", async ({
  page,
}) => {
  await page.goto("/");
  await goSkin(page);
  await page.getByLabel("Correct skin colour").fill("#abcdef");
  await expect(
    page.getByText("Your corrected swatches", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const path = "/packages/vision-core/src/index.ts";
    const { VisionPipeline, VisionWorkerClient } = await import(path);
    let first = true;
    for (const Engine of [VisionPipeline, VisionWorkerClient]) {
      const original = Engine.prototype.analyzeImage;
      Engine.prototype.analyzeImage = async function (
        this: unknown,
        ...args: unknown[]
      ) {
        const result = await original.apply(this, args);
        if (first) {
          first = false;
          await new Promise<void>((resolve) =>
            Object.assign(window, { __resumeOldSkin: resolve }),
          );
          Object.assign(window, { __oldSkinDone: true });
        }
        return result;
      };
    }
  });
  await page
    .getByRole("button", { name: "Read my colours locally", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { __resumeOldSkin?: unknown })
            .__resumeOldSkin,
      ),
    )
    .toBe("function");
  await page
    .locator(".skin-source input[type=file]")
    .setInputFiles("apps/web/public/images/portrait-2.jpg");
  await expect(page.locator(".skin-image-label")).toContainText(
    "Your session photo",
  );
  await expect(
    page.getByText("Swatches are starting examples until"),
  ).toBeVisible();
  await expect(page.getByLabel("Correct skin colour")).toHaveValue("#bc9279");
  await expect(
    page.getByRole("button", { name: "Show regions", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Read my colours locally", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Read my colours locally", exact: true })
    .click();
  await expect(
    page.getByText("Photo-based colour suggestion", { exact: true }),
  ).toBeVisible();
  const latest = await page.getByLabel("Correct skin colour").inputValue();
  await page.evaluate(() =>
    (window as unknown as { __resumeOldSkin: () => void }).__resumeOldSkin(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __oldSkinDone?: boolean }).__oldSkinDone,
      ),
    )
    .toBe(true);
  await expect(page.getByLabel("Correct skin colour")).toHaveValue(latest);
  await expect(
    page.getByText("Photo-based colour suggestion", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".skin-image-label")).toContainText(
    "Your session photo",
  );
});

test("portrait selection continues from mirror to Skin Lab and a Skin upload returns to the same mirror photo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Choose a demo portrait/ }).click();
  await page
    .getByRole("button", { name: "Soft portrait", exact: true })
    .click();
  await goSkin(page);
  await expect(page.locator(".skin-portrait canvas")).toHaveAttribute(
    "data-portrait-source",
    "/images/portrait-2.jpg",
  );
  await expect(
    page.getByRole("button", { name: "Read my colours locally", exact: true }),
  ).toBeEnabled();
  await page
    .locator(".skin-source input[type=file]")
    .setInputFiles("apps/web/public/images/portrait.jpg");
  await expect(page.locator(".skin-image-label")).toContainText(
    "Your session photo",
  );
  const sharedBlob = await page
    .locator(".skin-portrait canvas")
    .getAttribute("data-portrait-source");
  expect(sharedBlob).toMatch(/^blob:/);
  await expect(
    page.getByRole("button", { name: "Read my colours locally", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Back to your mirror", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little more you." }),
  ).toBeVisible();
  const bytesAvailable = await page.evaluate(async (url) => {
    const response = await fetch(url!);
    return response.ok && (await response.blob()).size > 100;
  }, sharedBlob);
  expect(bytesAvailable).toBe(true); // Skin Lab unmount did not revoke the session-owned URL.
  await expect(
    page.getByText("Face mesh connected", { exact: true }),
  ).toBeVisible();
  const canvasUsesPhoto = await page
    .locator(".mirror-media canvas")
    .evaluate(async (node, url) => {
      const canvas = node as HTMLCanvasElement,
        ctx = canvas.getContext("2d")!;
      const image = new Image();
      image.src = url!;
      await image.decode();
      const reference = document.createElement("canvas");
      reference.width = canvas.width;
      reference.height = canvas.height;
      reference
        .getContext("2d")!
        .drawImage(image, 0, 0, reference.width, reference.height);
      const a = Array.from(ctx.getImageData(3, 3, 1, 1).data),
        b = Array.from(
          reference.getContext("2d")!.getImageData(3, 3, 1, 1).data,
        );
      return a.every((value, i) => Math.abs(value - b[i]) <= 3);
    }, sharedBlob);
  expect(canvasUsesPhoto).toBe(true);
  await goSkin(page);
  await expect(page.locator(".skin-portrait canvas")).toHaveAttribute(
    "data-portrait-source",
    sharedBlob!,
  );
  await expect(page.locator(".skin-image-label")).toContainText(
    "Your session photo",
  );
});
