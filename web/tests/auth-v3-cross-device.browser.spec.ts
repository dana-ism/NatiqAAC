import { expect, test, type Route } from "@playwright/test";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";
import axe from "axe-core";

for (const locale of ["ar", "en"] as const) {
  for (const status of [
    "DRAFT",
    "PENDING_REVIEW",
    "APPROVED",
    "REJECTED",
  ] as const) {
    test(`V3 ${locale}: specialist ${status} in a restricted session (synthetic state fixture)`, async ({
      page,
    }) => {
      const c = locale === "ar" ? ar : en;
      const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature`;
      const user = {
        id: "synthetic",
        fullName: "Synthetic Specialist",
        email: "synthetic@example.com",
        role: "SPECIALIST",
        status: "ACTIVE",
      };
      await page.setViewportSize({ width: 375, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("natiqaac.locale", value),
        locale,
      );
      await page.route("http://localhost:3000/**", (route) => {
        const headers = {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type,authorization",
        };
        if (route.request().method() === "OPTIONS")
          return route.fulfill({ status: 204, headers });
        const path = new URL(route.request().url()).pathname;
        // Project a retained restricted session after its DB state changes.
        // A real fresh approved login issues ordinary access (covered by HTTP E2E).
        const body = path.endsWith("/login")
          ? { message: "ok", user, onboarding_token: token }
          : path.endsWith("/onboarding/me")
            ? {
                userId: user.id,
                email: user.email,
                role: "SPECIALIST",
                emailVerified: status !== "DRAFT",
                legacyAuthExempt: false,
              }
            : {
                id: "synthetic-application",
                status,
                specialization: "Synthetic communication",
                qualification: "Synthetic degree",
                summary: null,
                hasDocument: true,
                submittedAt: "2026-11-12T00:00:00Z",
                reviews:
                  status === "REJECTED"
                    ? [
                        {
                          decision: "REJECTED",
                          reason: "Synthetic review reason",
                          createdAt: "2026-11-12T00:00:00Z",
                        },
                      ]
                    : [],
              };
        return route.fulfill({
          status: 200,
          headers,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      });
      await page.goto("/login");
      await page.getByLabel(c["auth.email"]).fill(user.email);
      await page
        .getByLabel(c["auth.password"], { exact: true })
        .fill("Synthetic123!");
      await page
        .getByRole("button", { name: c["auth.login"], exact: true })
        .click();
      await expect(page).toHaveURL(/\/application-status$/);
      const stateKey =
        status === "DRAFT"
          ? "account.savedPending"
          : (`account.${status}` as const);
      await expect(page.getByText(c[stateKey], { exact: true })).toBeVisible();
      await page.addScriptTag({ content: axe.source });
      expect(
        await page.evaluate(async () =>
          (
            await window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
              },
            })
          ).violations.map((v) => v.id),
        ),
      ).toEqual([]);
      await page.evaluate(() => {
        if (
          document.activeElement instanceof HTMLElement &&
          document.activeElement.classList.contains("skip-link")
        )
          document.activeElement.blur();
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await page.screenshot({
        path: `../docs/assets/auth-v3/${locale}-375-specialist-${status.toLowerCase().replaceAll("_", "-")}.png`,
        fullPage: true,
      });
      if (status === "APPROVED") {
        await page
          .getByRole("button", { name: c["auth.signInLink"], exact: true })
          .click();
        await expect(page).toHaveURL(/\/login$/);
      }
    });
  }
  test(`V3 ${locale}: explicit confirmation on another device updates the original restricted session`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    const c = locale === "ar" ? ar : en;
    let verified = false,
      confirmations = 0,
      logins = 0;
    const user = {
      id: "synthetic-parent",
      fullName: "Synthetic Parent",
      email: "synthetic@example.com",
      role: "PARENT",
      status: "ACTIVE",
    };
    const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature`;
    async function fixture(route: Route) {
      const path = new URL(route.request().url()).pathname;
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type,authorization",
      };
      if (route.request().method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      let body: unknown = { message: "ok" };
      if (path === "/auth/register/parent")
        body = {
          message: "ok",
          user: { ...user, createdAt: new Date().toISOString() },
          verification: { emailSent: true },
        };
      else if (path === "/auth/login") {
        logins++;
        body = { message: "ok", user, onboarding_token: token };
      } else if (path === "/auth/onboarding/me") {
        expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
        body = {
          userId: user.id,
          email: user.email,
          role: "PARENT",
          emailVerified: verified,
          legacyAuthExempt: false,
        };
      } else if (path === "/auth/email/verify") {
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers().authorization).toBeUndefined();
        confirmations++;
        verified = true;
      } else throw new Error(`Unexpected synthetic route: ${path}`);
      return route.fulfill({
        status: path === "/auth/register/parent" ? 201 : 200,
        headers,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
    await page.route("http://localhost:3000/**", fixture);
    await page.addInitScript(
      (value) => localStorage.setItem("natiqaac.locale", value),
      locale,
    );
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.goto("/register/parent");
    await page.getByLabel(c["auth.fullName"]).fill(user.fullName);
    await page.getByLabel(c["auth.email"]).fill(user.email);
    await page
      .getByLabel(c["auth.password"], { exact: true })
      .fill("Synthetic123!");
    await page
      .getByLabel(c["account.confirmPassword"], { exact: true })
      .fill("Synthetic123!");
    await page
      .getByRole("button", { name: c["account.apply"], exact: true })
      .click();
    await expect(page).toHaveURL(/\/verification-pending$/);
    await expect(page.getByLabel(c["auth.email"])).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(page.getByLabel(c["auth.email"])).toHaveValue(user.email);
    // Returning unverified Parents must return to verification, not a specialist page.
    await page
      .getByRole("link", { name: c["auth.signInLink"], exact: true })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel(c["auth.email"]).fill(user.email);
    await page
      .getByLabel(c["auth.password"], { exact: true })
      .fill("Synthetic123!");
    await page
      .getByRole("button", { name: c["auth.login"], exact: true })
      .click();
    await expect(page).toHaveURL(/\/verification-pending$/);
    await page
      .getByRole("button", { name: c["account.checkVerified"], exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      c["account.stillPending"],
    );
    expect(verified).toBe(false);
    const device = await browser.newContext({
      viewport: { width: 375, height: 1000 },
      baseURL: String(test.info().project.use.baseURL),
    });
    try {
      await device.route("http://localhost:3000/**", fixture);
      await device.addInitScript(
        (value) => localStorage.setItem("natiqaac.locale", value),
        locale,
      );
      const phone = await device.newPage();
      await phone.goto("/verify-email#token=synthetic-cross-device-token");
      await expect(phone).toHaveURL(/\/verify-email$/);
      expect(confirmations).toBe(0);
      await phone
        .getByRole("button", { name: c["account.confirm"], exact: true })
        .click();
      await expect(phone.getByRole("status")).toContainText(
        c["account.verified"],
      );
      await phone.screenshot({
        path: `../docs/assets/auth-v3/${locale}-375-cross-device-confirmed.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: c["account.checkVerified"], exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        c["account.verified"],
      );
      expect(confirmations).toBe(1);
      expect(logins).toBe(2);
      await expect(page).toHaveURL(/\/verification-pending$/);
      await page.screenshot({
        path: `../docs/assets/auth-v3/${locale}-375-cross-device-original.png`,
        fullPage: true,
      });
      expect(await phone.evaluate(() => sessionStorage.length)).toBe(0);
      expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    } finally {
      await device.close();
    }
  });
}
