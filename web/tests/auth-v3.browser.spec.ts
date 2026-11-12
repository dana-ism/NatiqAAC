import { expect, test, chromium, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import axe from "axe-core";
test.setTimeout(60_000);
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";

const output = "../docs/assets/auth-v3";
async function audit(page: Page) {
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
      ).violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  // Axe can leave the skip link focused; keep its audit side effect out of captures.
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
  for (const width of [320, 375, 768, 1024, 1440]) {
    test(`V3 ${locale} ${width}: registration stages, errors and verification landing`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("natiqaac.locale", value),
        locale,
      );
      await page.route("http://localhost:3000/**", (route) =>
        route.fulfill({
          status: 400,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ message: "Invalid or expired" }),
        }),
      );
      for (const [path, state] of [
        ["/login", "login"],
        ["/register", "roles"],
        ["/register/parent", "parent"],
        ["/register/specialist", "specialist-identity"],
      ]) {
        await page.goto(path);
        await audit(page);
        if (width === 375 || width === 1440)
          await capture(page, `${locale}-${width}-${state}`);
      }
      await page.getByLabel(c["auth.fullName"]).fill("Synthetic Specialist");
      await page.getByLabel(c["auth.email"]).fill("synthetic@example.com");
      await page
        .getByLabel(c["auth.password"], { exact: true })
        .fill("Synthetic123!");
      await page
        .getByLabel(c["account.confirmPassword"], { exact: true })
        .fill("Different123!");
      await page
        .getByRole("button", { name: c["account.oauthContinue"], exact: true })
        .click();
      await expect(
        page.getByLabel(c["account.confirmPassword"], { exact: true }),
      ).toBeFocused();
      await audit(page);
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-mismatch`);
      await page
        .getByLabel(c["account.confirmPassword"], { exact: true })
        .fill("Synthetic123!");
      await page
        .getByRole("button", { name: c["account.oauthContinue"], exact: true })
        .click();
      await expect(page.getByLabel(c["account.specialization"])).toBeVisible();
      await expect(
        page.getByLabel(c["auth.password"], { exact: true }),
      ).toHaveCount(0);
      await audit(page);
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-specialist-professional`);
      await page
        .getByRole("button", { name: c["account.backIdentity"], exact: true })
        .click();
      await expect(page.getByLabel(c["auth.fullName"])).toHaveValue(
        "Synthetic Specialist",
      );
      await page.goto("/verification-pending");
      await audit(page);
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-verification-pending`);
      await page.goto("/verify-email#token=synthetic-expired-token");
      await expect(page).toHaveURL(/\/verify-email$/);
      await audit(page);
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-verification-action`);
      await page
        .getByRole("button", { name: c["account.confirm"], exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        c["account.invalidLink"],
      );
      await audit(page);
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-verification-invalid`);
    });
  }
  for (const provider of ["GOOGLE", "FACEBOOK"] as const) {
    test(`V3 ${locale} ${provider}: separate provider profile, trusted email and private PDF`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width: 375, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("natiqaac.locale", value),
        locale,
      );
      await context.route("https://accounts.google.com/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<script>location.href='http://localhost:3000/synthetic-callback'</script>",
        }),
      );
      await context.route("https://www.facebook.com/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<script>location.href='http://localhost:3000/synthetic-callback'</script>",
        }),
      );
      await context.route("http://localhost:3000/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/synthetic-callback")
          return route.fulfill({
            contentType: "text/html",
            body: `<script>opener.postMessage({type:'natiqaac-oauth',completionId:'${"c".repeat(43)}'},'*');</script>`,
          });
        const headers = {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type",
        };
        if (route.request().method() === "OPTIONS")
          return route.fulfill({ status: 204, headers });
        const body = path.endsWith("/start")
          ? {
              authorizationUrl:
                provider === "GOOGLE"
                  ? "https://accounts.google.com/synthetic"
                  : "https://www.facebook.com/synthetic",
            }
          : path.endsWith("/context")
            ? {
                provider,
                fullName: "Synthetic Specialist",
                email: provider === "GOOGLE" ? "synthetic@gmail.com" : null,
                emailTrusted: provider === "GOOGLE",
                linked: false,
              }
            : { message: "Conflict" };
        return route.fulfill({
          status: path.endsWith("/finish") ? 409 : 200,
          headers,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      });
      await page.goto("/register/specialist");
      const opened = page.waitForEvent("popup");
      await page
        .getByRole("button", {
          name: c[
            provider === "GOOGLE"
              ? "account.oauthGoogle"
              : "account.oauthFacebook"
          ],
          exact: true,
        })
        .click();
      await opened;
      await expect(page.getByLabel(c["account.specialization"])).toBeVisible();
      await expect(page.getByLabel(c["auth.fullName"])).toHaveValue(
        "Synthetic Specialist",
      );
      await expect(
        page.getByLabel(c["auth.password"], { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByLabel(c["account.confirmPassword"], { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: c["account.oauthGoogle"],
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(page.getByLabel(c["auth.email"])).toHaveCount(
        provider === "GOOGLE" ? 0 : 1,
      );
      await audit(page);
      await capture(page, `${locale}-375-${provider.toLowerCase()}-profile`);
      if (provider === "FACEBOOK")
        await page.getByLabel(c["auth.email"]).fill("synthetic@example.com");
      await page.getByLabel(c["account.specialization"]).fill("Communication");
      await page
        .getByLabel(c["account.qualification"])
        .fill("Synthetic degree");
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
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(
        page.getByText(c["account.socialConflict"], { exact: false }),
      ).toBeVisible();
      await audit(page);
      await capture(page, `${locale}-375-${provider.toLowerCase()}-conflict`);
    });
  }
  test(`V3 ${locale}: native browser zoom 200 percent`, async ({
    browserName,
  }, info) => {
    expect(browserName).toBe("chromium");
    test.setTimeout(60_000);
    const profile = info.outputPath("zoom-profile");
    await mkdir(`${profile}/Default`, { recursive: true });
    await writeFile(
      `${profile}/Default/Preferences`,
      JSON.stringify({
        partition: { default_zoom_level: { x: Math.log(2) / Math.log(1.2) } },
      }),
    );
    const context = await chromium.launchPersistentContext(profile, {
      ...(existsSync(
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      )
        ? { channel: "msedge" }
        : {}),
      viewport: null,
      headless: true,
      baseURL: String(info.project.use.baseURL),
      args: ["--window-size=1440,1000"],
    });
    try {
      const page = await context.newPage();
      await page.addInitScript(
        (value) => localStorage.setItem("natiqaac.locale", value),
        locale,
      );
      for (const path of [
        "/login",
        "/register",
        "/register/parent",
        "/register/specialist",
        "/verification-pending",
        "/verify-email",
      ]) {
        await page.goto(path);
        await audit(page);
        expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(2);
        expect(
          await page.evaluate(
            () => getComputedStyle(document.documentElement).zoom,
          ),
        ).toBe("1");
      }
    } finally {
      await context.close();
    }
  });
}
