import { chromium, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/claude-0/shots";
const CHROME = "/opt/pw-browsers/chromium";

const browser = await chromium.launch({
  ...(existsSync(CHROME) ? { executablePath: CHROME } : {}),
});

async function shoot(name, path, opts = {}) {
  const context = await browser.newContext({
    ...(opts.mobile ? devices["Pixel 7"] : { viewport: { width: 1440, height: 1000 } }),
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(opts.wait ?? 1200);
  if (opts.action) await opts.action(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.fullPage ?? false });
  console.log("shot:", name);
  await context.close();
}

// --- staff session, so admin pages can be captured ---
const loginCtx = await browser.newContext();
const api = await loginCtx.request.post(`${BASE}/api/auth/staff-login`, {
  data: { email: "admin@example.com", password: "ChangeMe!Dev123" },
});
console.log("staff login:", api.status());
const staffState = await loginCtx.storageState();
await loginCtx.close();

// --- patient session ---
const patientCtx = await browser.newContext();
const otpRes = await patientCtx.request.post(`${BASE}/api/auth/patient-otp`, {
  data: { phone: "+919000000001" },
});
const otpJson = await otpRes.json();
if (otpJson.ok && otpJson.data.devCode) {
  await patientCtx.request.post(`${BASE}/api/auth/patient-verify`, {
    data: { phone: "+919000000001", code: otpJson.data.devCode },
  });
}
const patientState = await patientCtx.storageState();
await patientCtx.close();

// Public
await shoot("01-home-desktop", "/", { fullPage: true, wait: 2500 });
await shoot("02-home-mobile", "/", { mobile: true, fullPage: true, wait: 2500 });
await shoot("03-treatment-page", "/services/dental-implants", { fullPage: true });
await shoot("04-landing-page", "/dental-implants-chandigarh", { fullPage: true });
await shoot("05-booking-step1", "/book-appointment", { wait: 1500 });
await shoot("06-booking-mobile", "/book-appointment", { mobile: true, wait: 1500 });
await shoot("07-contact", "/contact", { fullPage: true });
await shoot("08-international", "/international-patients", { fullPage: true });

// Booking flow, mid-journey
await shoot("09-booking-slots", "/book-appointment", {
  wait: 1200,
  action: async (page) => {
    await page.locator('[data-testid="booking-treatment"][data-slug="dental-implants"]').click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /first available/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.locator('[data-testid="booking-date"]').nth(4).click();
    await page.locator('[data-testid="booking-slot"]').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
  },
});

// Admin
for (const [name, path] of [
  ["10-admin-overview", "/admin"],
  ["11-admin-front-desk", "/admin/front-desk"],
  ["12-admin-calendar", "/admin/calendar"],
  ["13-admin-appointments", "/admin/appointments"],
  ["14-admin-content-verification", "/admin/content-verification"],
  ["15-admin-leads", "/admin/leads"],
  ["16-admin-attendance", "/admin/attendance"],
  ["17-admin-reports", "/admin/reports"],
  ["18-admin-notifications", "/admin/notifications"],
  ["19-admin-settings", "/admin/settings"],
]) {
  await shoot(name, path, { storageState: staffState, fullPage: true, wait: 1800 });
}

// Patient portal
for (const [name, path] of [
  ["20-portal-overview", "/patient-dashboard"],
  ["21-portal-appointments", "/patient-dashboard/appointments"],
  ["22-portal-invoices", "/patient-dashboard/invoices"],
]) {
  await shoot(name, path, { storageState: patientState, fullPage: true, wait: 1500 });
}

await browser.close();
console.log("done");
