import { test, expect } from "@playwright/test";
import { seedUserViaApi } from "./helpers";

/**
 * Login + logout flow. The account is seeded through the API (fast), then we
 * exercise the real login form and the cabinet logout button.
 */
test("user can log in with phone + password and log out", async ({ page, request }) => {
  const user = await seedUserViaApi(request, { name: "Login User" });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();

  await page.getByPlaceholder("+7 (700) 123-45-67").fill(user.phoneDigits);
  await page.getByPlaceholder("Пароль").fill(user.password);
  await page.getByRole("button", { name: "Войти" }).click();

  await page.waitForURL("**/cabinet", { timeout: 15_000 });
  await expect(page.getByText("Login User")).toBeVisible();

  // Logout from the cabinet header returns to the auth page.
  await page.getByRole("button", { name: "Выход" }).click();
  await page.waitForURL("**/account", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
});

test("login with wrong password shows an error", async ({ page, request }) => {
  const user = await seedUserViaApi(request, { name: "Wrong Pw User" });

  await page.goto("/login");
  await page.getByPlaceholder("+7 (700) 123-45-67").fill(user.phoneDigits);
  await page.getByPlaceholder("Пароль").fill("totally-wrong-pass");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByText(/Invalid credentials|Неверн/i)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/login$/);
});
