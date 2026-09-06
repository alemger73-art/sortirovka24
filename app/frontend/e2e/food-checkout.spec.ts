import { test, expect, type Page } from "@playwright/test";


// Floating cart is hidden on desktop (>=1024px); food flows are mobile-first.
test.use({ viewport: { width: 390, height: 844 } });

async function waitForFoodMenu(page: Page) {
  await page.goto("/food");
  await expect(page.locator(".dam-page")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    () => !document.querySelector(".dam-skeleton") && !!document.querySelector(".dam-grid-card"),
    { timeout: 60_000 },
  );
}

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
  await page.locator(".dam-grid-card__add").first().click();
  const modalAdd = page.locator(
    'button:has-text("В корзину"), button:has-text("Қосу"), [data-testid="dam-product-add"]',
  ).first();
  await expect(modalAdd).toBeVisible({ timeout: 8_000 });
  await modalAdd.click();
}

async function openCheckoutWizard(page: Page) {
  await addItemToCart(page);
  await page.getByTestId("dam-floating-cart").click();
  await expect(page.getByTestId("dam-cart-sheet")).toBeVisible();
  await page.getByTestId("dam-cart-checkout").click();
  await expect(page.getByRole("heading", { name: /получение/i })).toBeVisible({ timeout: 5_000 });
}

test("checkout shows a reason instead of a silent disabled button", async ({ page }) => {
  await waitForFoodMenu(page);
  await openCheckoutWizard(page);

  await page.getByRole("button", { name: /самовывоз|алып кету/i }).click().catch(() => {});
  await page.getByTestId("dam-checkout-next").click();

  await expect(page.getByRole("heading", { name: /контакт/i })).toBeVisible({ timeout: 5_000 });
  await page.getByPlaceholder("Введите имя").fill("Тест");
  await page.getByPlaceholder("+7 (___) ___-__-__").fill("+77001234567");
  await page.getByTestId("dam-checkout-next").click();

  await expect(page.getByRole("heading", { name: /подтверждение/i })).toBeVisible({ timeout: 5_000 });
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
  await openCheckoutWizard(page);
  await page.getByRole("button", { name: /самовывоз|алып кету/i }).click().catch(() => {});
  await page.getByTestId("dam-checkout-next").click();
  await page.getByPlaceholder("Введите имя").fill("Тест");
  await page.getByPlaceholder("+7 (___) ___-__-__").fill("+77001234567");
  await page.getByTestId("dam-checkout-next").click();

  const submit = page.getByTestId("dam-checkout-submit");
  await submit.click();
  await submit.click();
  await page.waitForTimeout(600);
  expect(posts).toBeLessThanOrEqual(1);
});
