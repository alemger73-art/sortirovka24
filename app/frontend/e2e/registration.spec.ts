import { test, expect } from "@playwright/test";
import { acceptLegalDoc, randomPhoneDigits } from "./helpers";

/**
 * Full browser registration flow:
 *   Step 1 (data + legal) → Step 2 (SMS code) → Step 3 (password) → /cabinet
 *
 * Requires the backend on :8000 with DEBUG=1 so the SMS code is exposed on
 * screen and auto-filled by the UI.
 */
test("user can register and reach the personal cabinet", async ({ page }) => {
  const phone = randomPhoneDigits();
  const password = "E2ePass123!";

  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Регистрация" })).toBeVisible();

  // Step 1: data + legal agreements
  await page.getByPlaceholder("Ваше имя").fill("E2E Тест");
  await page.getByPlaceholder("+7 (700) 123-45-67").fill(phone);

  await acceptLegalDoc(page, "Пользовательское соглашение");
  await acceptLegalDoc(page, "Политика конфиденциальности");
  await expect(page.getByText("Оба документа приняты")).toBeVisible();

  await page.getByRole("button", { name: "Получить SMS-код" }).click();

  // Step 2: SMS code (auto-filled from the on-screen debug code)
  const codeInput = page.getByPlaceholder("• • • •");
  await expect(codeInput).toBeVisible();
  await expect(codeInput).not.toHaveValue("", { timeout: 10_000 });
  await page.getByRole("button", { name: "Подтвердить код" }).click();

  // Step 3: password
  await page.getByPlaceholder("Пароль (мин. 8 символов)").fill(password);
  await page.getByPlaceholder("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();

  // Lands in the personal cabinet
  await page.waitForURL("**/cabinet", { timeout: 15_000 });
  await expect(page.getByText("E2E Тест")).toBeVisible();
});
