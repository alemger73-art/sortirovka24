import { test, expect, type Page } from "@playwright/test";


// Floating cart is hidden on desktop (>=1024px); food flows are mobile-first.
test.use({ viewport: { width: 390, height: 844 } });

async function waitForFoodMenu(page: Page) {
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

/** Prefer a card without required options so quick-add fills the cart immediately. */
async function addItemToCart(page: Page) {
  const cards = page.locator(".dam-grid-card");
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    if ((await card.locator(".dam-grid-card__tag--opt").count()) > 0) continue;
    const addBtn = card.locator(".dam-grid-card__add");
    if ((await addBtn.count()) === 0) continue;
    await addBtn.click();
    return;
  }

  // Fallback: open first add (may open options modal) and confirm.
  await page.locator(".dam-grid-card__add").first().click();
  const modalAdd = page.locator(
    'button:has-text("В корзину"), button:has-text("Қосу"), [data-testid="dam-product-add"]',
  ).first();
  await expect(modalAdd).toBeVisible({ timeout: 8_000 });
  await modalAdd.click();
}

test("cart tab: add item, change quantity, open checkout", async ({ page }) => {
  await waitForFoodMenu(page);
  await addItemToCart(page);

  const floatingCart = page.getByTestId("dam-floating-cart");
  await expect(floatingCart).toBeVisible({ timeout: 10_000 });
  await floatingCart.click();

  const cartPage = page.getByTestId("dam-cart-sheet");
  await expect(cartPage).toBeVisible();
  await expect(page).toHaveURL(/tab=cart/);

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

test("cart tab: back to menu works", async ({ page }) => {
  await waitForFoodMenu(page);
  await addItemToCart(page);
  await page.getByTestId("dam-floating-cart").click();

  await expect(page.getByTestId("dam-cart-sheet")).toBeVisible();

  await page.getByRole("button", { name: "Вернуться в меню" }).click();
  await expect(page.getByTestId("dam-cart-sheet")).toBeHidden();
  await expect(page).not.toHaveURL(/tab=cart/);
});
