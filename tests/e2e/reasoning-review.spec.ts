import { test, expect } from "@playwright/test";
const sessionId = "11111111-1111-4111-8111-111111111111",
  quoteId = "22222222-2222-4222-8222-222222222222";
test("connected reasoning fixture requires exact preview, quote and consent before real local tool execution", async ({
  page,
}, testInfo) => {
  let starts = 0,
    steps = 0;
  const quoteBodies: unknown[] = [];
  const feedbackBodies: Array<{
    feedback: Array<{ status: string; summary: string }>;
  }> = [];
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { csrfToken: "fixture-csrf" } }),
  );
  await page.route("**/api/reasoning/capabilities", (route) =>
    route.fulfill({
      json: {
        configured: true,
        paidEnabled: true,
        ready: true,
        model: "fixture-model",
        provider: "Fixture only",
        liveVerified: false,
        unavailableReason: null,
        maxSteps: 4,
        imagesAccepted: false,
        retention: "Contract fixture only; no provider call.",
      },
    }),
  );
  await page.route("**/api/reasoning/quotes", async (route) => {
    quoteBodies.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        quoteId,
        maximumUsd: 0.02,
        currency: "USD",
        maxSteps: 3,
        maxOutputTokens: 1000,
        inputTokenCeiling: 32000,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        model: "fixture-model",
        pricingProvenance: {
          sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
          reviewedAt: new Date().toISOString(),
          kind: "operator-reviewed-upper-bound",
        },
        note: "Fixture quote only",
      },
    });
  });
  await page.route("**/api/reasoning/sessions", async (route) => {
    starts++;
    const body = route.request().postDataJSON();
    expect(body.payload.context).toEqual({});
    expect(body.consent.textTransmission).toBe(true);
    expect(body.consent.providerRetentionAcknowledged).toBe(true);
    expect(body.maxUsd).toBeGreaterThanOrEqual(0.02);
    await route.fulfill({ json: { sessionId, reservedMaximumUsd: 0.02 } });
  });
  await page.route(
    `**/api/reasoning/sessions/${sessionId}/step`,
    async (route) => {
      steps++;
      feedbackBodies.push(route.request().postDataJSON());
      await route.fulfill({
        json:
          steps === 1
            ? {
                status: "needs-tools",
                calls: [
                  {
                    id: "fixture-lip-call",
                    name: "setLipColor",
                    args: { color: "#792C48" },
                  },
                ],
                guidance: "Fixture tool request only.",
                stepsUsed: 1,
                stepsRemaining: 2,
                usage: { inputTokens: 30, outputTokens: 20 },
              }
            : {
                status: "done",
                calls: [],
                guidance: "Fixture received the actual local result.",
                stepsUsed: 2,
                stepsRemaining: 1,
                usage: { inputTokens: 60, outputTokens: 20 },
              },
      });
    },
  );
  await page.route(`**/api/reasoning/sessions/${sessionId}`, (route) =>
    route.fulfill({ json: { cancelled: true } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Your beauty companion", exact: true })
    .click();
  const agent = page.getByRole("dialog", { name: "Your beauty agent" });
  await agent.getByLabel("Assistant mode").selectOption("remote");
  await expect(agent.getByText(/fixture-model/)).toBeVisible();
  await agent.getByLabel("Your beauty request").fill("A soft berry lip");
  await agent.getByRole("button", { name: "Send request" }).click();
  const review = agent.getByRole("region", {
    name: "Review connected reasoning request",
  });
  await expect(review).toBeVisible();
  expect(starts).toBe(0);
  await expect(
    review.getByRole("checkbox", { name: "Self-reported beauty profile" }),
  ).toBeDisabled();
  await review.getByRole("button", { name: "Prepare exact preview" }).click();
  await expect(review.locator("pre")).toContainText("A soft berry lip");
  await expect(review.locator("pre")).toContainText('"context": {}');
  await review
    .getByRole("button", { name: "Get a maximum-cost quote" })
    .click();
  await expect(
    review.getByText("Up to US$0.020000", { exact: true }),
  ).toBeVisible();
  expect(starts).toBe(0);
  expect(quoteBodies[0]).not.toHaveProperty("goal");
  expect(quoteBodies[0]).not.toHaveProperty("context");
  await expect(
    review.getByRole("button", { name: "Authorize up to US$0.020000 and run" }),
  ).toBeDisabled();
  await review
    .getByRole("checkbox", { name: /Send this request, exactly/ })
    .check();
  await review
    .getByRole("checkbox", { name: /I reviewed the maximum cost/ })
    .check();
  await page.screenshot({
    path: `cook/stills/r06/reasoning-review-${testInfo.project.name}.png`,
  });
  await review
    .getByRole("button", { name: "Authorize up to US$0.020000 and run" })
    .click();
  await expect(
    agent.getByText("Changed your lip preview to #792C48.", { exact: true }),
  ).toBeVisible();
  expect(starts).toBe(1);
  expect(steps).toBe(2);
  expect(feedbackBodies[1].feedback[0].status).toBe("succeeded");
  expect(feedbackBodies[1].feedback[0].summary).toContain("#792C48");
  await agent.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel("Custom makeup colour")).toHaveValue("#792c48");
});

test("unconfigured connected reasoning is visibly unavailable and local mode continues to work", async ({
  page,
}) => {
  await page.route("**/api/reasoning/capabilities", (route) =>
    route.fulfill({
      json: {
        configured: false,
        paidEnabled: false,
        ready: false,
        model: null,
        provider: null,
        liveVerified: false,
        unavailableReason:
          "A server-side reasoning credential and model are not configured.",
        maxSteps: 4,
        imagesAccepted: false,
        retention: "Fixture unavailable state.",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Your beauty companion", exact: true })
    .click();
  const agent = page.getByRole("dialog", { name: "Your beauty agent" });
  await agent.getByLabel("Assistant mode").selectOption("remote");
  await expect(
    agent.getByText(/credential and model are not configured/),
  ).toBeVisible();
  await agent.getByLabel("Your beauty request").fill("A rose lip");
  await agent.getByRole("button", { name: "Send request" }).click();
  await agent.getByRole("button", { name: "Prepare exact preview" }).click();
  await expect(
    agent.getByRole("button", { name: "Get a maximum-cost quote" }),
  ).toBeDisabled();
  await agent.getByRole("button", { name: "Back to chat" }).click();
  await agent.getByLabel("Assistant mode").selectOption("local");
  await agent.getByLabel("Your beauty request").fill("Make my lips rose");
  await agent.getByRole("button", { name: "Send request" }).click();
  await expect(
    agent.getByText("Changed your lip preview to #B35B6B.", { exact: true }),
  ).toBeVisible();
});
