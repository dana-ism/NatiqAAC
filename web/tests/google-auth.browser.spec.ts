import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import axe from "axe-core";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";

// Synthetic provider transport; real browser, routing and SessionProvider.
// Never visits Google's live consent screen or uses the owner's user records.
test.setTimeout(60_000);
const output = "../docs/assets/google-auth-finalization";
type Scenario = "parent" | "specialist" | "linked" | "conflict" | "unavailable";
async function fixture(context: BrowserContext, scenario: Scenario) {
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  let submitted = false;
  let linking = false;
  const role = scenario === "specialist" ? "SPECIALIST" : "PARENT";
  const identity = {
    userId: "synthetic-user",
    email: "synthetic@gmail.com",
    role,
  };
  const token = `synthetic.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url")}.synthetic`;
  const session = {
    message: "ok",
    user: {
      id: identity.userId,
      fullName: "Synthetic Google User",
      email: identity.email,
      role,
      status: "ACTIVE",
    },
    ...(role === "SPECIALIST"
      ? { onboarding_token: token }
      : { access_token: token }),
  };
  await context.route("https://accounts.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<script>location.href='http://localhost:3000/synthetic-callback'</script>",
    }),
  );
  await context.route("http://localhost:3000/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/synthetic-callback")
      return route.fulfill({
        contentType: "text/html",
        body: `<script>opener.postMessage({type:'natiqaac-oauth',completionId:'${"c".repeat(43)}'},'*')</script>`,
      });
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const body = req.headers()["content-type"]?.includes("application/json")
      ? (req.postDataJSON() as Record<string, unknown>)
      : null;
    calls.push({ path, body });
    let status = 200;
    let response: unknown = { message: "ok" };
    if (path.endsWith("/start")) {
      linking = path === "/auth/oauth/link/start";
      response = { authorizationUrl: "https://accounts.google.com/synthetic" };
    } else if (path.endsWith("/context")) {
      status = scenario === "unavailable" ? 404 : 200;
      response = {
        provider: "GOOGLE",
        fullName: "Synthetic Google User",
        email: identity.email,
        emailTrusted: true,
        linked: scenario === "linked",
      };
    } else if (path === "/auth/oauth/finish") {
      status = scenario === "conflict" && !linking ? 409 : 200;
      response =
        status === 409
          ? { code: "OAUTH_EMAIL_CONFLICT", message: "Conflict" }
          : session;
    } else if (path === "/auth/login") response = session;
    else if (path === "/auth/me") response = identity;
    else if (path === "/auth/onboarding/me")
      response = { ...identity, emailVerified: true, legacyAuthExempt: false };
    else if (path === "/specialist/application/submit") submitted = true;
    else if (path === "/specialist/application" && req.method() === "GET")
      response = {
        application: {
          id: "synthetic-application",
          status: submitted ? "PENDING_REVIEW" : "DRAFT",
          specialization: "Communication",
          qualification: "Degree",
          summary: null,
          hasDocument: submitted,
          reviews: [],
        },
      };
    return route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return calls;
}
async function begin(page: Page, label: string) {
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: label, exact: true }).click();
  await opened;
}
async function capture(page: Page, name: string) {
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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir(output, { recursive: true });
  await page.evaluate(() => {
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement.classList.contains("skip-link")
    )
      document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
for (const locale of ["ar", "en"] as const) {
  const c = locale === "ar" ? ar : en;
  for (const width of [375, 1440]) {
    test(`${locale} ${width}: new Login Parent uses same proof and no repeated form`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("natiqaac.locale", value),
        locale,
      );
      const calls = await fixture(context, "parent");
      await page.goto("/login");
      await begin(page, c["account.oauthGoogle"]);
      await expect(
        page.getByRole("button", { name: c["account.parent"], exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel(c["auth.password"], { exact: true }),
      ).toHaveCount(0);
      await capture(page, `${locale}-${width}-role`);
      await page
        .getByRole("button", { name: c["account.parent"], exact: true })
        .click();
      await expect(page).toHaveURL(/\/home$/);
      const finish = calls.find((v) => v.path === "/auth/oauth/finish")!.body!;
      expect(finish.registrationRole).toBe("PARENT");
      expect(finish.verifier).toBe(
        calls.find((v) => v.path.endsWith("/context"))!.body!.verifier,
      );
      expect(finish).not.toHaveProperty("password");
      expect(finish).not.toHaveProperty("email");
      expect(
        await page.evaluate(() =>
          [
            ...Object.values(localStorage),
            ...Object.values(sessionStorage),
          ].some((v) => String(v).startsWith("synthetic.")),
        ),
      ).toBe(false);
      await capture(page, `${locale}-${width}-parent-home`);
    });
    test(`${locale} ${width}: Login Specialist uploads PDF before pending review navigation`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("natiqaac.locale", value),
        locale,
      );
      const calls = await fixture(context, "specialist");
      await page.goto("/login");
      await begin(page, c["account.oauthGoogle"]);
      await page
        .getByRole("button", { name: c["account.specialist"], exact: true })
        .click();
      await expect(page.getByLabel(c["auth.fullName"])).toHaveCount(0);
      await expect(page.getByLabel(c["auth.email"])).toHaveCount(0);
      await expect(
        page.getByLabel(c["auth.password"], { exact: true }),
      ).toHaveCount(0);
      await page.getByLabel(c["account.specialization"]).fill("Communication");
      await page.getByLabel(c["account.qualification"]).fill("Degree");
      await capture(page, `${locale}-${width}-specialist-profile`);
      await page
        .getByRole("button", { name: c["account.oauthContinue"], exact: true })
        .click();
      expect(calls.some((v) => v.path.endsWith("/finish"))).toBe(false);
      await page
        .getByLabel(c["account.document"], { exact: true })
        .setInputFiles({
          name: "qualification.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.7\nSynthetic\n%%EOF"),
        });
      await page
        .getByRole("button", { name: c["account.oauthContinue"], exact: true })
        .click();
      await expect(page).toHaveURL(/\/application-status$/);
      expect(
        calls.find((v) => v.path.endsWith("/finish"))!.body!.registrationRole,
      ).toBe("SPECIALIST");
      expect(
        calls.some((v) => v.path === "/specialist/application/document"),
      ).toBe(true);
      expect(
        calls.some((v) => v.path === "/specialist/application/submit"),
      ).toBe(true);
      await capture(page, `${locale}-${width}-specialist-pending`);
    });
  }
  test(`${locale}: email conflict has working fresh login and explicit link confirmation`, async ({
    page,
    context,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("natiqaac.locale", value),
      locale,
    );
    const calls = await fixture(context, "conflict");
    await page.goto("/register/parent");
    await begin(page, c["account.oauthGoogle"]);
    await expect(
      page.getByText(c["account.googleEmailConflict"], { exact: true }),
    ).toBeVisible();
    await capture(page, `${locale}-email-conflict`);
    await page
      .getByRole("button", { name: c["account.signInToLink"], exact: true })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel(c["auth.email"]).fill("synthetic@gmail.com");
    await page
      .getByLabel(c["auth.password"], { exact: true })
      .fill("Synthetic123!");
    await page
      .getByRole("button", { name: c["auth.login"], exact: true })
      .click();
    await expect(page).toHaveURL(/\/account\/connections$/);
    await expect(
      page.getByText(c["account.linkedProvider"], { exact: true }),
    ).toHaveCount(0);
    await begin(page, c["account.oauthGoogle"]);
    await expect(
      page.getByText(c["account.linkedProvider"], { exact: true }),
    ).toBeVisible();
    expect(calls.some((v) => v.path === "/auth/oauth/link/start")).toBe(true);
    expect(calls.filter((v) => v.path === "/auth/oauth/finish")).toHaveLength(
      2,
    );
    await capture(page, `${locale}-link-success`);
  });
  test(`${locale}: unavailable context never claims an existing email conflict`, async ({
    page,
    context,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("natiqaac.locale", value),
      locale,
    );
    await fixture(context, "unavailable");
    await page.goto("/register/parent");
    await begin(page, c["account.oauthGoogle"]);
    await expect(
      page.getByText(c["account.signInUnavailable"], { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: c["account.signInToLink"] }),
    ).toHaveCount(0);
    await capture(page, `${locale}-service-unavailable`);
  });
  test(`${locale}: linked identity from Specialist signup logs in without role selection`, async ({
    page,
    context,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("natiqaac.locale", value),
      locale,
    );
    const calls = await fixture(context, "linked");
    await page.goto("/register/specialist");
    await begin(page, c["account.oauthGoogle"]);
    await expect(page).toHaveURL(/\/home$/);
    expect(
      calls.find((v) => v.path.endsWith("/finish"))!.body,
    ).not.toHaveProperty("registrationRole");
    expect(calls.some((v) => v.path.includes("/specialist/"))).toBe(false);
  });
}
