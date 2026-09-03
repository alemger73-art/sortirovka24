import { test, expect } from "@playwright/test";

async function waitForFoodMenu(page: import("@playwright/test").Page) {
  await page.goto("/food");
  await expect(page.locator(".dam-page")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    () => !document.querySelector(".dam-skeleton") && !!document.querySelector(".dam-grid-card"),
    { timeout: 60_000 },
  );
}

test("checkout shows a reason instead of a silent disabled button", async ({ page }) => {
  await waitForFoodMenu(page);
  await page.locator(".dam-grid-card__add").first().click();
  await page.locator(".dam-floating-cart").click();
  await expect(page.getByTestId("dam-cart-sheet")).toBeVisible();

  const cartCheckout = page.getByTestId("dam-cart-checkout");
  await expect(cartCheckout).toBeEnabled();
  await cartCheckout.click();

  await expect(page.getByRole("heading", { name: /оформ/i })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /самовывоз|алып кету/i }).click().catch(() => {});
  await page.getByPlaceholder("Введите имя").fill("Тест");
  await page.getByPlaceholder("+7 (___) ___-__-__").fill("+77001234567");
  const submit = page.getByTestId("dam-checkout-submit");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByTestId("auth-prompt-modal").or(page.getByTestId("dam-checkout-block-reason"))).toBeVisible({
    timeout: 5_000,
  });
});

test("double click on submit does not enable a second in-flight request", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/v1/entities/food_orders", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      await new Promise((r) => setTimeout(r, 400));
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Укажите адрес доставки" }),
      });
      return;
    }
    await route.continue();
  });

  await waitForFoodMenu(page);
  await page.locator(".dam-grid-card__add").first().click();
  await page.locator(".dam-floating-cart").click();
  await page.getByTestId("dam-cart-checkout").click();
  const submit = page.getByTestId("dam-checkout-submit");
  await submit.click();
  await submit.click();
  await page.waitForTimeout(600);
  expect(posts).toBeLessThanOrEqual(1);
});
