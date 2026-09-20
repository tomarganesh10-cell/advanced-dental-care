import { expect, test } from "@playwright/test";

test.describe("public site", () => {
  test("the homepage loads with its primary calls to action", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /book an appointment/i }).first()).toBeVisible();
  });

  test("no unverified clinic statistic is rendered", async ({ page }) => {
    await page.goto("/");
    const body = (await page.textContent("body")) ?? "";

    // The specific contradictory figures from the previous site. None of them
    // may appear until the claim is verified in the admin panel.
    expect(body).not.toMatch(/25\s*\+?\s*years/i);
    expect(body).not.toMatch(/18\s*\+?\s*years/i);
    expect(body).not.toMatch(/20,?000\+?\s*(patients|clients)/i);
    expect(body).not.toMatch(/5,?000\+?\s*(patients|clients)/i);
  });

  test("no prohibited superiority or guarantee claim appears", async ({ page }) => {
    for (const path of ["/", "/services/dental-implants", "/about"]) {
      await page.goto(path);
      const body = ((await page.textContent("body")) ?? "").toLowerCase();

      expect(body, `${path} must not claim to be the best`).not.toContain("best dentist");
      expect(body, `${path} must not claim a rank`).not.toContain("no. 1 dental");
      expect(body, `${path} must not guarantee results`).not.toContain("guaranteed result");
      expect(body, `${path} must not promise painless treatment`).not.toContain("100% painless");
    }
  });

  test("the medical disclaimer is in the footer", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/does not replace a professional dental consultation/i),
    ).toBeVisible();
  });

  test("the sticky action bar is present on mobile only", async ({ page }, testInfo) => {
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: /quick actions/i });

    if (testInfo.project.name === "mobile") {
      await expect(bar).toBeVisible();
      await expect(bar.getByText("WhatsApp")).toBeVisible();
    } else {
      await expect(bar).toBeHidden();
    }
  });

  test("a treatment page renders its process and FAQs", async ({ page }) => {
    await page.goto("/services/dental-implants");

    await expect(page.getByRole("heading", { name: /dental implants/i }).first()).toBeVisible();
    await expect(page.getByText(/the treatment step by step/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /is implant surgery painful/i })).toBeVisible();
  });

  test("a legacy URL is permanently redirected", async ({ page }) => {
    const response = await page.goto("/dental-implants");
    expect(page.url()).toContain("/services/dental-implants");
    expect(response?.status()).toBe(200);
  });

  test("the admin area redirects an anonymous visitor", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/staff-login/);
  });

  test("the patient portal redirects an anonymous visitor", async ({ page }) => {
    await page.goto("/patient-dashboard");
    await expect(page).toHaveURL(/patient-login/);
  });

  test("private areas are excluded from robots.txt", async ({ request }) => {
    const response = await request.get("/robots.txt");
    const body = await response.text();

    expect(body).toContain("Disallow: /admin");
    expect(body).toContain("Disallow: /patient-dashboard");
    expect(body).toContain("Sitemap:");
  });

  test("the sitemap lists the treatment and landing pages", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    const body = await response.text();

    expect(body).toContain("/services/dental-implants");
    expect(body).toContain("/dental-implants-chandigarh");
    expect(body).not.toContain("/admin");
    expect(body).not.toContain("/patient-dashboard");
  });
});
