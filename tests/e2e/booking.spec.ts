import { expect, test } from "@playwright/test";

/**
 * Booking flow, end to end in a real browser.
 *
 * Relies on OTP_DEV_ECHO, which surfaces the code in the UI outside production.
 * The env validation refuses to start production with it enabled, so this
 * cannot accidentally become a production affordance.
 */

test.describe("booking", () => {
  test("a new patient can book an appointment", async ({ page }) => {
    await page.goto("/book-appointment");

    await expect(page.getByRole("heading", { name: /book an appointment/i })).toBeVisible();

    // Step 1 — treatment
    await page.locator('[data-testid="booking-treatment"][data-slug="dental-implants"]').click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 2 — dentist
    await expect(page.getByRole("heading", { name: /who would you like to see/i })).toBeVisible();
    await page.getByRole("button", { name: /first available/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 3 — date and time
    await expect(page.getByRole("heading", { name: /choose a date and time/i })).toBeVisible();

    // Pick a date a few days out so the two-hour lead time cannot interfere.
    await page.locator('[data-testid="booking-date"]').nth(4).click();

    const slot = page.locator('[data-testid="booking-slot"]').first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await slot.click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 4 — details
    const unique = Date.now().toString().slice(-7);
    await page.getByLabel(/full name/i).fill("Playwright Patient");
    await page.getByLabel(/mobile number/i).fill(`98${unique}0`);
    await page.getByLabel(/^email/i).fill(`e2e-${unique}@example.com`);
    await page.getByRole("button", { name: /send verification code/i }).click();

    // Step 5 — verify
    await expect(page.getByRole("heading", { name: /confirm your number/i })).toBeVisible({
      timeout: 15_000,
    });

    const devNotice = page.getByText(/your code is (\d{6})/i);
    await expect(devNotice).toBeVisible();
    const text = (await devNotice.textContent()) ?? "";
    const code = text.match(/(\d{6})/)?.[1];
    expect(code).toBeTruthy();

    await page.getByLabel(/verification code/i).fill(code!);
    await page.getByRole("button", { name: /confirm booking/i }).click();

    // Step 6 — confirmation
    await expect(page.getByRole("heading", { name: /appointment requested/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/ADC-A-/)).toBeVisible();
  });

  test("the booking form rejects an invalid mobile number", async ({ page }) => {
    await page.goto("/book-appointment");

    await page.locator('[data-testid="booking-treatment"][data-slug="general-dentistry"]').click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /first available/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    await page.locator('[data-testid="booking-date"]').nth(4).click();

    const slot = page.locator('[data-testid="booking-slot"]').first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await slot.click();
    await page.getByRole("button", { name: /continue/i }).click();

    await page.getByLabel(/full name/i).fill("Invalid Number Test");
    // Ten digits, but not a valid Indian mobile — must be rejected rather than
    // silently treated as an international number.
    await page.getByLabel(/mobile number/i).fill("1234567890");
    await page.getByRole("button", { name: /send verification code/i }).click();

    await expect(page.getByText(/valid mobile number/i)).toBeVisible({ timeout: 15_000 });
  });
});
