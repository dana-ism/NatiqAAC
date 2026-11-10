import { expect, test, chromium, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import axe from "axe-core";
import { workspace } from "./admin.fixture";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";
import { futureAdminSections } from "../src/features/admin/admin-sections";

async function check(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const state = await page.evaluate(async () => ({
    dpr: devicePixelRatio,
    width: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    cssZoom: getComputedStyle(document.documentElement).zoom,
    pinchScale: visualViewport?.scale,
    violations: (await window.axe.run()).violations.map((v) => v.id),
  }));
  expect(state.dpr).toBeCloseTo(2);
  expect(state.width).toBeLessThan(800);
  expect(state.cssZoom).toBe("1");
  expect(state.pinchScale).toBe(1);
  expect(state.overflow).toBe(false);
  expect(state.violations).toEqual([]);
}
async function screenshot(page: Page, path: string) {
  // A native-zoom viewport must be captured without Playwright's CSS-pixel clip.
  const client = await page.context().newCDPSession(page);
  try {
    const result = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(path, Buffer.from(result.data, "base64"));
  } finally {
    await client.detach();
  }
}

for (const locale of ["ar", "en"] as const) {
  test(`Signature ${locale}: native browser zoom 200%, reflow, details and confirmation`, async ({
    browserName,
  }, info) => {
    expect(browserName).toBe("chromium");
    test.setTimeout(60_000);
    const profile = info.outputPath("isolated-zoom-profile");
    await mkdir(profile + "/Default", { recursive: true });
    // Chromium's default storage partition key is x, not a CSS/device emulation.
    // https://chromium.googlesource.com/chromium/src/+/lkgr/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc
    await writeFile(
      profile + "/Default/Preferences",
      JSON.stringify({
        partition: { default_zoom_level: { x: Math.log(2) / Math.log(1.2) } },
      }),
    );
    const context = await chromium.launchPersistentContext(profile, {
      ...(process.platform === "win32" &&
      existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
        ? { channel: "msedge" }
        : {}),
      baseURL: String(info.project.use.baseURL),
      headless: true,
      viewport: null,
      reducedMotion: "reduce",
      args: ["--window-size=1440,1000"],
    });
    try {
      const page = await context.newPage(),
        copy = locale === "ar" ? ar : en;
      const state = await workspace(page, locale);
      await check(page);
      await screenshot(page, info.outputPath(`zoom-${locale}-overview.png`));
      state.listFails = false;
      await page.getByRole("link", { name: copy["admin.reviewCta"] }).click();
      await page.locator(".admin-row-action").waitFor();
      await check(page);
      await screenshot(
        page,
        info.outputPath(`zoom-${locale}-applications.png`),
      );
      await page.locator(".admin-row-action").click();
      await check(page);
      await screenshot(page, info.outputPath(`zoom-${locale}-details.png`));
      await page
        .getByRole("button", { name: copy["account.reject"], exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: copy["account.confirmReject"],
          exact: true,
        }),
      ).toBeFocused();
      await check(page);
      for (const section of futureAdminSections) {
        await page
          .getByRole("button", { name: copy["admin.navigation"], exact: true })
          .click();
        await page
          .getByRole("link", { name: new RegExp("^" + copy[section.title]) })
          .click();
        await expect(
          page.getByRole("heading", {
            name: copy[section.title],
            level: 1,
            exact: true,
          }),
        ).toBeVisible();
        await check(page);
        if (section.path === "/admin/users")
          await screenshot(
            page,
            info.outputPath(`zoom-${locale}-coming-soon.png`),
          );
      }
    } finally {
      await context.close();
    }
  });
}
