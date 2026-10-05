import { test, expect } from "@playwright/test";
import { seedUserViaApi } from "./helpers";

/**
 * Login + logout flow. The account is seeded through the API (fast), then we
 * exercise the real login form and the cabinet logout button.
 */
test("user can log in with phone + password and log out", async ({ page, request }) => {
  const user = await seedUserViaApi(request, { name: "Login User" });

  await page.goto("/login");
  await page.getByRole("button", { name: "Уже есть пароль? Войти по паролю" }).click();
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();

  await page.getByPlaceholder("700 123 45 67").fill(user.phoneDigits);
  await page.getByPlaceholder("Пароль").fill(user.password);
  await page.getByRole("button", { name: "Войти" }).click();

  await page.waitForURL("**/cabinet", { timeout: 15_000 });
  await expect(page.getByLabel('Имя',{exact:true})).toHaveValue('Login User');

  // Logout from the cabinet header returns to the auth page.
  await page.getByRole("button", { name: "Выход", exact:true }).first().click();
  await page.waitForURL("**/account", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Войти в Sortirovka24" })).toBeVisible();
});

test("login with wrong password shows an error", async ({ page, request }) => {
  const user = await seedUserViaApi(request, { name: "Wrong Pw User" });

  await page.goto("/login");
  await page.getByRole("button", { name: "Уже есть пароль? Войти по паролю" }).click();
  await page.getByPlaceholder("700 123 45 67").fill(user.phoneDigits);
  await page.getByPlaceholder("Пароль").fill("totally-wrong-pass");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByText(/Invalid credentials|Неверн/i)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/login$/);
});

// Real local API, outbound SMS disabled and test-only debug code.
test("passwordless SMS creates a verified cabinet with canonical phone", async ({ page }) => {
  const digits = '700' + String(Math.floor(Math.random() * 10000000)).padStart(7, '0');
  await page.goto('/account');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name: 'Продолжить по телефону'}).click();
  const phone = page.getByLabel('Номер телефона, код страны +7', {exact:true});
  await phone.fill('700');
  await expect(page.getByRole('button',{name:'Получить SMS-код'})).toBeDisabled();
  await phone.fill('8' + digits);
  await expect(phone).toHaveValue(digits);
  const response = page.waitForResponse(r => r.url().endsWith('/account/signin/request-sms') && r.request().method() === 'POST');
  await page.getByRole('button',{name:'Получить SMS-код'}).click();
  const sms = await (await response).json();
  expect(sms.debug_code).toMatch(/^\d{6}$/);
  await page.getByLabel('Код из 6 цифр', {exact:true}).fill(sms.debug_code);
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.waitForURL('**/cabinet', {timeout:15000});
  await expect(page.getByRole('button',{name:'Выход',exact:true}).first()).toBeVisible();
});
