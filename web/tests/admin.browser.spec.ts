import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";

for (const width of [375, 768, 1024, 1440]) {
  for (const locale of ["ar", "en"] as const) {
    test(`Admin ${locale} at ${width}px: authorization UX, keyboard, reflow and axe`, async ({
      page,
    }) => {
      const copy = locale === "ar" ? ar : en;
      await page.setViewportSize({ width, height: 1000 });
      const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature`;
      let overviewCalls = 0;
      await page.route("http://localhost:3000/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        const headers = {
          "access-control-allow-origin": new URL(
            String(test.info().project.use.baseURL),
          ).origin,
          "access-control-allow-headers": "authorization,content-type",
          "access-control-allow-methods": "GET,POST",
          "content-type": "application/json",
        };
        if (route.request().method() === "OPTIONS")
          return route.fulfill({ status: 204, headers });
        const user = {
          id: "synthetic-admin-id",
          email: "admin@example.com",
          role: "ADMIN",
          status: "ACTIVE",
          fullName: "Synthetic Admin",
        };
        let body: unknown;
        if (path === "/auth/login")
          body = { message: "ok", access_token: token, user };
        else if (path === "/auth/me")
          body = { userId: user.id, email: user.email, role: user.role };
        else if (path === "/admin/overview") {
          overviewCalls++;
          expect(route.request().headers().authorization).toBe(
            `Bearer ${token}`,
          );
          body = { account: { email: user.email, role: user.role } };
        } else throw new Error(`Unexpected request: ${path}`);
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify(body),
        });
      });
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/login$/);
      if (locale === "en")
        await page
          .getByRole("button", { name: "English", exact: true })
          .click();
      await page.getByLabel(copy["auth.email"]).fill("admin@example.com");
      await page
        .getByLabel(copy["auth.password"], { exact: true })
        .fill("SyntheticPass123!");
      await page
        .getByRole("button", { name: copy["auth.login"], exact: true })
        .click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByText(copy["admin.accessVerified"])).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await expect(page).toHaveTitle(
        `${copy["admin.title"]} | ${copy["brand.name"]}`,
      );
      await expect(page.getByText("synthetic-admin-id")).toHaveCount(0);
      if (width <= 800) {
        const toggle = page.getByRole("button", {
          name: copy["admin.navigation"],
        });
        await toggle.focus();
        await page.keyboard.press("Enter");
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Tab");
        await expect(
          page.getByRole("link", {
            name: copy["admin.overview"],
            exact: true,
          }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(toggle).toBeFocused();
      }
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      );
      expect(violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: `test-results/admin-${locale}-${width}.png`,
        fullPage: true,
      });
      const callsBeforeLocaleSwitch = overviewCalls;
      await page
        .getByRole("button", {
          name: locale === "ar" ? "English" : "العربية",
          exact: true,
        })
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "ltr" : "rtl",
      );
      expect(overviewCalls).toBe(callsBeforeLocaleSwitch);
      expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
        "natiqaac.locale",
      ]);
      expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
      const switched = locale === "ar" ? en : ar;
      await page
        .getByRole("button", { name: switched["home.signOut"] })
        .click();
      await expect(page).toHaveURL(/\/login$/);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/login$/);
    });
  }
}
