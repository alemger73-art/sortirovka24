import { test, expect } from "@playwright/test";
import { seedUserViaApi, loginViaUi } from "./helpers";

test("masters catalog page loads and shows key UI", async ({ page }) => {
  await page.goto("/masters");
  await expect(page.getByRole("heading", { name: /Нужен мастер/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Стать мастером").first()).toBeVisible();
  await expect(page.getByText("Срочно вызвать").first()).toBeVisible();
});

test("become master route requires login", async ({ page }) => {
  await page.goto("/masters/become");
  await page.waitForURL("**/account", { timeout: 10_000 });
  await expect(page).toHaveURL(/\/account/);
});

test("logged-in user can open become master wizard", async ({ page, request }) => {
  const user = await seedUserViaApi(request, { name: "Future Master" });
  await loginViaUi(page, user);

  await page.goto("/masters/become");
  await expect(page.getByRole("heading", { name: /Стать мастером/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Контакты").first()).toBeVisible();
});
