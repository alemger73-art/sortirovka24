import { test, expect } from "@playwright/test";

async function waitForFoodMenu(page: import("@playwright/test").Page) {
  await page.goto("/food");
  await expect(page.locator(".dam-page")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const skeleton = document.querySelector(".dam-skeleton");
      const grid = document.querySelector(".dam-grid-card");
      return !skeleton && !!grid;
    },
    { timeout: 60_000 },
  );
}

test("cart drawer: add item, change quantity, open checkout", async ({ page }) => {
  await waitForFoodMenu(page);

  const quickAdd = page.locator(".dam-grid-card__add").first();
  await expect(quickAdd).toBeVisible({ timeout: 15_000 });
  await quickAdd.click();

  const floatingCart = page.locator(".dam-floating-cart");
  await expect(floatingCart).toBeVisible({ timeout: 5_000 });
  await floatingCart.click();

  const sheet = page.getByTestId("dam-cart-sheet");
  await expect(sheet).toBeVisible();

  const qtyValue = page.getByTestId("dam-cart-qty-value");
  await expect(qtyValue).toHaveText("1");

  await page.getByTestId("dam-cart-qty-plus").click();
  await expect(qtyValue).toHaveText("2");

  await page.getByTestId("dam-cart-qty-minus").click();
  await expect(qtyValue).toHaveText("1");

  const checkoutBtn = page.getByTestId("dam-cart-checkout");
  await expect(checkoutBtn).toBeEnabled({ timeout: 5_000 });
  await checkoutBtn.click();

  await expect(page.getByRole("heading", { name: /получение|оформ|checkout/i })).toBeVisible({
    timeout: 5_000,
  });
});

test("cart drawer: close button works", async ({ page }) => {
  await waitForFoodMenu(page);

  const quickAdd = page.locator(".dam-grid-card__add").first();
  await quickAdd.click();
  await page.locator(".dam-floating-cart").click();

  await expect(page.getByTestId("dam-cart-sheet")).toBeVisible();

  await page.getByTestId("dam-cart-sheet").locator(".dam-sheet-header button").click();
  await expect(page.getByTestId("dam-cart-sheet")).toBeHidden();
});
