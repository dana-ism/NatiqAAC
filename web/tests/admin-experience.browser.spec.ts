import { savedAdminProfile } from "./profile.fixture";
import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";

async function accessible(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () =>
    (await window.axe.run()).violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
  );
  expect(violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const width of [320, 375, 768, 1024, 1440, 1920])
  for (const locale of ["ar", "en"] as const) {
    test(`Admin experience ${locale} ${width}px: shared shell, actual summary contract, filters, review and full axe`, async ({
      page,
    }) => {
      const copy = locale === "ar" ? ar : en;
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(
        (l) => localStorage.setItem("natiqaac.locale", l),
        locale,
      );
      let status = "PENDING_REVIEW",
        posts = 0;
      const app = () => ({
        id: "synthetic-application",
        fullName: "Synthetic Specialist",
        email: "specialist@example.com",
        specialization: "Communication",
        qualification: "Synthetic academic qualification",
        summary: "Synthetic professional information",
        submittedAt: "2026-11-09T10:00:00.000Z",
        status,
        hasDocument: true,
        reviews: [],
      });
      await page.route("http://localhost:3000/**", async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
        const headers = {
          "access-control-allow-origin": new URL(
            String(test.info().project.use.baseURL),
          ).origin,
          "access-control-allow-headers": "authorization,content-type",
          "access-control-allow-methods": "GET,POST",
          "content-type": "application/json",
        };
        if (request.method() === "OPTIONS")
          return route.fulfill({ status: 204, headers });
        let body: unknown;
        if (path === "/auth/login")
          body = {
            message: "ok",
            access_token: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature`,
            user: {
              id: "synthetic-admin",
              fullName: "Synthetic Admin",
              email: "admin@example.com",
              role: "ADMIN",
              status: "ACTIVE",
            },
          };
        else if (path === "/auth/me")
          body = {
            userId: "synthetic-admin",
            email: "admin@example.com",
            role: "ADMIN",
          };
        else if (path === "/admin/profile") body = savedAdminProfile;
        else if (path.endsWith("/dashboard"))
          body = {
            pendingCount: 140,
            approvedCount: 0,
            rejectedCount: 0,
            totalCount: 140,
            recentApplications: [],
          };
        else if (path === "/admin/specialist-applications")
          body = { applications: [app()] };
        else if (path.endsWith("/synthetic-application"))
          body = { application: app() };
        else if (path.endsWith("/reject")) {
          expect(request.postDataJSON()).toEqual({
            reason: "Synthetic review reason",
          });
          posts++;
          status = "REJECTED";
          body = { message: "ok" };
        } else throw new Error(`Unexpected intercepted endpoint: ${path}`);
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify(body),
        });
      });
      await page.goto("/login");
      await page.locator("#email").fill("admin@example.com");
      await page.locator("#password").fill("Synthetic123!");
      await page.locator("form button.primary-button").click();
      await expect(page.locator(".admin-pending-count strong")).toHaveText(
        new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(140),
      );
      await expect(
        page.locator('nav:visible [aria-current="page"]'),
      ).toHaveCount(width <= 900 ? 0 : 1);
      await accessible(page);
      if (width <= 900) {
        const toggle = page.getByRole("button", {
          name: copy["admin.navigation"],
          exact: true,
        });
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        const dialog = page.getByRole("dialog", {
          name: copy["admin.navigation"],
        });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("button", {
            name: copy["signature.closeNavigation"],
          }),
        ).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(
          dialog.getByRole("link", {
            name: new RegExp("^" + copy["adminV2.audit"]),
          }),
        ).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(
          dialog.getByRole("button", {
            name: copy["signature.closeNavigation"],
          }),
        ).toBeFocused();
        await accessible(page);
        await page.keyboard.press("Escape");
        await expect(toggle).toBeFocused();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
      }
      await page.getByRole("link", { name: copy["admin.reviewCta"] }).click();
      await expect(page).toHaveURL(/status=PENDING_REVIEW/);
      await expect(page.locator(".admin-shell")).toHaveCount(1);
      if (width <= 900)
        await page
          .getByRole("button", { name: copy["admin.navigation"], exact: true })
          .click();
      await expect(
        page.locator('nav:visible [aria-current="page"]'),
      ).toHaveCount(1);
      await expect(
        page.locator('nav:visible [aria-current="page"]'),
      ).toHaveAttribute("href", "/admin/specialist-applications");
      if (width <= 900)
        await page
          .getByRole("button", {
            name: copy["signature.closeNavigation"],
            exact: true,
          })
          .click();
      await page
        .getByLabel(copy["admin.search"], { exact: true })
        .fill("no-match");
      await expect(
        page.getByText(copy["admin.noResults"], { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: copy["admin.clearFilters"] })
        .click();
      await expect(
        page.getByText("Synthetic Specialist", { exact: true }),
      ).toBeVisible();
      await accessible(page);
      await page
        .getByRole("button", {
          name: `${copy["account.details"]}: Synthetic Specialist`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Synthetic Specialist",
          exact: true,
        }),
      ).toBeFocused();
      await accessible(page);
      await page
        .getByRole("button", { name: copy["account.reject"], exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: copy["account.confirmReject"],
          exact: true,
        }),
      ).toBeFocused();
      const confirm = page.getByRole("button", {
        name: copy["account.confirmDecision"],
        exact: true,
      });
      await page
        .getByLabel(copy["account.reason"], { exact: true })
        .fill("short");
      await expect(confirm).toBeDisabled();
      await page
        .getByLabel(copy["account.reason"], { exact: true })
        .fill("Synthetic review reason");
      await accessible(page);
      await confirm.click();
      await expect(
        page.getByText(copy["account.decided"], { exact: true }),
      ).toBeVisible();
      expect(posts).toBe(1);
      await expect(page.locator(".admin-table .admin-status")).toHaveText(
        copy["account.REJECTED"],
      );
      await expect(
        page.getByRole("button", {
          name: `${copy["account.details"]}: Synthetic Specialist`,
          exact: true,
        }),
      ).toBeFocused();
      expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
        "natiqaac.locale",
      ]);
      expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    });
  }
