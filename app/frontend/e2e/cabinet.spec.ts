import { test, expect } from "@playwright/test";
import { seedUserViaApi, loginViaUi } from "./helpers";

test("user can change password in the cabinet and re-login with it", async ({ page, request }) => {
  const user = await seedUserViaApi(request, { name: "Pw Change User" });
  const newPassword = "NewSecurePass456!";

  await loginViaUi(page, user);

  // Open the Settings tab and change the password.
  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByPlaceholder("Текущий пароль").fill(user.password);
  await page.getByPlaceholder("Новый пароль (мин. 8 символов)").fill(newPassword);
  await page.getByPlaceholder("Повторите новый пароль").fill(newPassword);
  await page.getByRole("button", { name: "Смена пароля" }).click();

  await expect(page.getByText("Пароль успешно изменён")).toBeVisible({ timeout: 10_000 });

  // Log out and log back in with the NEW password.
  await page.getByRole("button", { name: "Выход" }).first().click();
  await page.waitForURL("**/account", { timeout: 10_000 });
  await loginViaUi(page, { ...user, password: newPassword });
  await expect(page.getByText("Pw Change User")).toBeVisible();
});

test("regular user is redirected away from role-restricted cabinets", async ({ page, request }) => {
  const user = await seedUserViaApi(request, { name: "Plain User" });
  await loginViaUi(page, user);

  for (const path of ["/cabinet/admin", "/cabinet/master", "/cabinet/partner"]) {
    await page.goto(path);
    // RequireCabinetRole denies non-privileged roles and redirects to /cabinet.
    await page.waitForURL("**/cabinet", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/cabinet$/);
  }
});
