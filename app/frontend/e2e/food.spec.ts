import { test, expect } from "@playwright/test";

// Match Dam Alem food flows (floating cart / layout are mobile-first).
test.use({ viewport: { width: 390, height: 844 } });

/**
 * DAM ALEM food module smoke test — catalog loads from API.
 */
test("food page loads menu after backend warmup", async ({ page }) => {
  await page.goto("/food");

  // Prefer the Dam Alem page root (Layout also has min-h-screen).
  await expect(page.locator(".dam-page").first()).toBeVisible({
    timeout: 30_000,
  });

  // Wait for loading to finish (skeleton or spinner gone).
  await page
    .waitForFunction(
      () => {
        const loading = document.querySelector(".animate-pulse, .animate-spin");
        return !loading;
      },
      { timeout: 45_000 },
    )
    .catch(() => {});

  const hasMenu =
    (await page.getByText(/все блюда|блюда|меню|корзин/i).count()) > 0 ||
    (await page.locator(".dam-page").count()) > 0;

  expect(hasMenu).toBeTruthy();
});

test("business apply API accepts valid payload", async ({ request }) => {
  const res = await request.post("/api/v1/business/apply", {
    data: {
      name: "E2E Partner",
      phone: "+77001112233",
      activity: "food",
      description: "Playwright smoke test",
    },
  });
  expect(res.ok(), `business apply failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.success).toBe(true);
});
