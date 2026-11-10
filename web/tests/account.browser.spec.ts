import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";

async function audit(page: Page) {
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
}
function token() {
  return `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature`;
}
async function localeSetup(page: Page, locale: "ar" | "en") {
  await page.addInitScript(
    (value) => localStorage.setItem("natiqaac.locale", value),
    locale,
  );
}

for (const width of [375, 768, 1440]) {
  for (const locale of ["ar", "en"] as const) {
    const copy = locale === "ar" ? ar : en;
    test(`Account registration and explicit verification ${locale} ${width}px (mocked API, axe)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await localeSetup(page, locale);
      let verificationCalls = 0;
      let registrationBody: Record<string, unknown> | undefined;
      await page.route("http://localhost:3000/**", async (route) => {
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
        const path = new URL(route.request().url()).pathname;
        if (path === "/auth/email/verify") {
          verificationCalls++;
          expect(route.request().method()).toBe("POST");
          expect(route.request().postDataJSON()).toEqual({
            token: "synthetic-verification-token",
          });
        }
        if (path === "/auth/register/specialist") {
          registrationBody = route.request().postDataJSON();
          return route.fulfill({
            status: 201,
            headers,
            body: JSON.stringify({
              message: "ok",
              user: {
                id: "synthetic-id",
                fullName: "Synthetic Specialist",
                email: "synthetic@example.com",
                role: "SPECIALIST",
                status: "PENDING",
                createdAt: new Date().toISOString(),
              },
              verification: { emailSent: true },
            }),
          });
        }
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ message: "ok" }),
        });
      });
      await page.goto("/register");
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await audit(page);
      await page
        .getByRole("link", { name: copy["account.parent"], exact: true })
        .click();
      await expect(page.getByLabel(copy["auth.fullName"])).toBeVisible();
      await audit(page);
      await page.goto("/register");
      await page
        .getByRole("link", { name: copy["account.specialist"], exact: true })
        .click();
      await audit(page);
      await page.getByLabel(copy["auth.fullName"]).fill("Synthetic Specialist");
      await page.getByLabel(copy["auth.email"]).fill("Synthetic@Example.com");
      await page
        .getByLabel(copy["auth.password"], { exact: true })
        .fill("Synthetic123!");
      await page
        .getByLabel(copy["account.specialization"])
        .fill("Communication");
      await page
        .getByLabel(copy["account.qualification"])
        .fill("Synthetic degree");
      await page
        .getByLabel(copy["account.summary"])
        .fill("Synthetic professional information");
      await page
        .getByRole("button", { name: copy["account.apply"], exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: copy["account.pending"] }),
      ).toBeVisible();
      expect(registrationBody).toEqual({
        fullName: "Synthetic Specialist",
        email: "synthetic@example.com",
        password: "Synthetic123!",
        specialization: "Communication",
        qualification: "Synthetic degree",
        summary: "Synthetic professional information",
        locale,
      });
      await audit(page);
      await page
        .getByRole("button", { name: copy["account.resend"], exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        copy["account.resendDone"],
      );
      await page.goto("/verify-email#token=synthetic-verification-token");
      await expect(page).toHaveURL(/\/verify-email$/);
      expect(verificationCalls).toBe(0);
      await audit(page);
      const confirm = page.getByRole("button", {
        name: copy["account.confirm"],
        exact: true,
      });
      await confirm.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status")).toContainText(
        copy["account.verified"],
      );
      expect(verificationCalls).toBe(1);
      await audit(page);
      expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
      expect(
        await page.evaluate(() => JSON.stringify({ ...localStorage })),
      ).not.toContain("synthetic-verification-token");
    });

    test(`Specialist application and admin decision ${locale} ${width}px (mocked API, axe)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await localeSetup(page, locale);
      let admin = false;
      let verified = false;
      let document = false;
      let status = "DRAFT";
      let lastDecision = "";
      const application = () => ({
        id: "synthetic-application",
        status,
        fullName: "Synthetic Specialist",
        email: "synthetic@example.com",
        specialization: "Communication",
        qualification: "Synthetic degree",
        submittedAt: status === "DRAFT" ? null : "2026-11-09T00:00:00Z",
        summary: "Synthetic professional information",
        hasDocument: document,
        reviews: [],
      });
      await page.route("http://localhost:3000/**", async (route) => {
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
        const path = new URL(route.request().url()).pathname;
        const user = {
          id: "synthetic-id",
          fullName: admin ? "Synthetic Admin" : "Synthetic Specialist",
          email: "synthetic@example.com",
          role: admin ? "ADMIN" : "SPECIALIST",
          status: admin ? "ACTIVE" : "PENDING",
        };
        let body: unknown = { message: "ok" };
        if (path === "/auth/login")
          body = {
            message: "ok",
            [admin ? "access_token" : "onboarding_token"]: token(),
            user,
          };
        else if (path === "/auth/me" || path === "/auth/onboarding/me")
          body = {
            userId: user.id,
            email: user.email,
            role: user.role,
            emailVerified: verified,
            legacyAuthExempt: false,
          };
        else if (path === "/specialist/application/document") {
          expect(route.request().headers()["content-type"]).toContain(
            "multipart/form-data",
          );
          document = true;
        } else if (path === "/specialist/application/submit") {
          expect(verified && document).toBe(true);
          status = "PENDING_REVIEW";
        } else if (path === "/specialist/application/me") body = application();
        else if (path === "/admin/overview")
          body = { account: { email: user.email, role: user.role } };
        else if (path === "/admin/specialist-applications/dashboard")
          body = {
            pendingCount: status === "PENDING_REVIEW" ? 1 : 0,
            approvedCount: status === "APPROVED" ? 1 : 0,
            rejectedCount: status === "REJECTED" ? 1 : 0,
            totalCount: 1,
            recentApplications: [],
          };
        else if (path === "/admin/specialist-applications")
          body = { applications: [application()] };
        else if (path.endsWith("/document"))
          return route.fulfill({
            status: 200,
            headers: { ...headers, "content-type": "application/pdf" },
            body: Buffer.from("%PDF-1.4\nSynthetic test document"),
          });
        else if (path.endsWith("/approve") || path.endsWith("/reject")) {
          lastDecision = path.endsWith("/approve") ? "approve" : "reject";
          if (lastDecision === "reject")
            expect(route.request().postDataJSON()).toEqual({
              reason: "Synthetic review reason",
            });
          status = lastDecision === "approve" ? "APPROVED" : "REJECTED";
        } else if (
          path === "/admin/specialist-applications/synthetic-application"
        )
          body = { application: application() };
        else throw new Error(`Unexpected mocked request: ${path}`);
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify(body),
        });
      });
      async function login() {
        await page.goto("/login");
        await page.getByLabel(copy["auth.email"]).fill("synthetic@example.com");
        await page
          .getByLabel(copy["auth.password"], { exact: true })
          .fill("Synthetic123!");
        await page
          .getByRole("button", { name: copy["auth.login"], exact: true })
          .click();
      }
      await login();
      await expect(page).toHaveURL(/\/application-status$/);
      await expect(
        page.getByRole("button", { name: copy["account.submit"], exact: true }),
      ).toBeDisabled();
      await audit(page);
      await page
        .getByLabel(copy["account.document"], { exact: true })
        .setInputFiles({
          name: "synthetic.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\nSynthetic test document"),
        });
      await page
        .getByRole("button", { name: copy["account.upload"], exact: true })
        .click();
      await expect(
        page.getByText(copy["account.documentPresent"]),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: copy["account.submit"], exact: true }),
      ).toBeDisabled();
      verified = true;
      await page
        .getByRole("button", { name: copy["home.signOut"], exact: true })
        .click();
      await login();
      await page
        .getByRole("button", { name: copy["account.submit"], exact: true })
        .click();
      await expect(
        page.getByText(copy["account.PENDING_REVIEW"], { exact: true }),
      ).toBeVisible();
      await audit(page);
      await page
        .getByRole("button", { name: copy["home.signOut"], exact: true })
        .click();
      admin = true;
      await login();
      await expect(page).toHaveURL(/\/admin$/);
      if (width <= 800)
        await page
          .getByRole("button", { name: copy["admin.navigation"], exact: true })
          .click();
      await page
        .getByRole("link", { name: copy["account.applications"], exact: true })
        .click();
      await expect(
        page.getByText("Synthetic Specialist", { exact: true }),
      ).toBeVisible();
      await audit(page);
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
      await audit(page);
      const downloading = page.waitForEvent("download");
      await page
        .getByRole("button", { name: copy["account.download"], exact: true })
        .click();
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(
        /^qualification-document(?:\.pdf)?$/,
      );
      const reject = width === 375;
      await page
        .getByRole("button", {
          name: copy[reject ? "account.reject" : "account.approve"],
          exact: true,
        })
        .click();
      expect(lastDecision).toBe("");
      if (reject) {
        await expect(
          page.getByRole("button", {
            name: copy["account.confirmDecision"],
            exact: true,
          }),
        ).toBeDisabled();
        await page
          .getByLabel(copy["account.reason"])
          .fill("Synthetic review reason");
      }
      await page
        .getByRole("button", {
          name: copy["account.confirmDecision"],
          exact: true,
        })
        .click();
      await expect(
        page.getByText(copy["account.decided"], { exact: true }),
      ).toBeVisible();
      expect(lastDecision).toBe(reject ? "reject" : "approve");
    });
  }
}
