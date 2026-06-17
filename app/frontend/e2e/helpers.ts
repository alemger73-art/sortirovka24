import { expect, type APIRequestContext, type Page } from "@playwright/test";

export function randomPhoneDigits(): string {
  // 10 digits, first digit not 7/8 (the phone input strips a leading 7/8).
  const tail = Math.floor(100_000_000 + Math.random() * 899_999_999);
  return `9${tail}`;
}

export interface SeededUser {
  name: string;
  phoneDigits: string;
  phoneNormalized: string;
  password: string;
}

/**
 * Create an account directly through the API (request-sms + confirm).
 * Requires the backend running with DEBUG=1 so `debug_code` is returned.
 */
export async function seedUserViaApi(
  request: APIRequestContext,
  overrides: Partial<SeededUser> = {},
): Promise<SeededUser> {
  const phoneDigits = overrides.phoneDigits || randomPhoneDigits();
  const phone = `+7${phoneDigits}`;
  const name = overrides.name || "Seed User";
  const password = overrides.password || "SeedPass123!";

  const smsResp = await request.post("/api/v1/account/register/request-sms", {
    data: { phone },
  });
  expect(smsResp.ok(), `request-sms failed: ${smsResp.status()}`).toBeTruthy();
  const sms = await smsResp.json();
  const code = sms.debug_code;
  expect(code, "expected debug_code (backend must run with DEBUG=1)").toBeTruthy();

  const confirmResp = await request.post("/api/v1/account/register/confirm", {
    data: {
      name,
      phone,
      password,
      language: "ru",
      agreement_accepted: true,
      privacy_accepted: true,
      sms_code: code,
    },
  });
  expect(confirmResp.ok(), `confirm failed: ${confirmResp.status()}`).toBeTruthy();

  return { name, phoneDigits, phoneNormalized: phone, password };
}

/** Log in through the real UI form and wait for the cabinet. */
export async function loginViaUi(page: Page, user: SeededUser) {
  await page.goto("/login");
  await page.getByPlaceholder("+7 (700) 123-45-67").fill(user.phoneDigits);
  await page.getByPlaceholder("Пароль").fill(user.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/cabinet", { timeout: 15_000 });
}

export async function acceptLegalDoc(page: Page, buttonText: string) {
  await page.getByRole("button", { name: new RegExp(buttonText) }).click();
  const dialog = page.locator("div.fixed.inset-0.z-\\[100\\]");
  await expect(dialog).toBeVisible();
  const scroller = dialog.locator("div.overflow-y-auto");
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  const accept = dialog.getByRole("button", { name: /согласен/i });
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(dialog).toBeHidden();
}
