import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Customers sign in only with a WhatsApp/Telegram code (passwords are for staff),
// so the session is created through the same code flow the site uses.
async function signInWithCode(page: Page, request: APIRequestContext, name: string) {
  const phone = `+7701${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  const legal = { legal_version: "2026-10-19", legal_subject_name: name, agreement_accepted: true, privacy_accepted: true, language: "ru" };
  const sms = await request.post("/api/v1/account/signin/request-sms", { data: { phone, ...legal } });
  expect(sms.ok(), `request-sms failed: ${sms.status()}`).toBeTruthy();
  const code = (await sms.json()).debug_code;
  expect(code, "expected debug_code (backend must run with DEBUG=1)").toBeTruthy();
  const confirm = await request.post("/api/v1/account/signin/confirm", { data: { phone, code, ...legal } });
  expect(confirm.ok(), `confirm failed: ${confirm.status()}`).toBeTruthy();
  const { token } = await confirm.json();
  await page.addInitScript(t => { localStorage.setItem("account_token", t); }, token);
  return phone;
}

test("customer has no password section and opens on order history", async ({ page, request }) => {
  await signInWithCode(page, request, "Plain User");
  await page.goto("/cabinet?tab=settings");
  await expect(page.getByRole("button", { name: "Выйти из аккаунта", exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Текущий пароль")).toHaveCount(0);
});

test("regular user is redirected away from role-restricted cabinets", async ({ page, request }) => {
  await signInWithCode(page, request, "Plain User");
  for (const path of ["/cabinet/admin", "/cabinet/master", "/cabinet/partner"]) {
    await page.goto(path);
    // RequireCabinetRole denies non-privileged roles and redirects to /cabinet.
    await page.waitForURL("**/cabinet", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/cabinet$/);
  }
});
