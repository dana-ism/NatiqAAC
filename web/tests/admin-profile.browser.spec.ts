import { expect, test, chromium, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import axe from "axe-core";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";
import { savedAdminProfile } from "./profile.fixture";

test.setTimeout(60000);
const output = "../docs/assets/admin-profile";
const raster = createRequire(
  new URL("../../backend/package.json", import.meta.url),
)("sharp");
async function fixture(page: Page, locale: "ar" | "en") {
  const image = (await raster({
    create: { width: 24, height: 24, channels: 3, background: "#194b49" },
  })
    .webp()
    .toBuffer()) as Buffer;
  let unblockSave: () => void = () => undefined;
  const state = {
    profile: structuredClone(savedAdminProfile),
    conflict: false,
    failure: false,
    saves: 0,
    uploads: 0,
    removals: 0,
    imageFailure: false,
    photoFailure: false,
    photoConflict: false,
    holdSave: false,
    releaseSave: () => unblockSave(),
  };
  await page.addInitScript(
    (value) => localStorage.setItem("natiqaac.locale", value),
    locale,
  );
  await page.route("http://localhost:3000/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    let body: unknown;
    let status = 200;
    if (path === "/auth/login")
      body = {
        message: "ok",
        access_token: `synthetic.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.synthetic`,
        user: {
          id: "synthetic-admin",
          fullName: state.profile.fullName,
          email: state.profile.email,
          role: "ADMIN",
          status: "ACTIVE",
        },
      };
    else if (path === "/auth/me")
      body = {
        userId: "synthetic-admin",
        email: state.profile.email,
        role: "ADMIN",
      };
    else if (path === "/admin/profile") {
      status = state.failure ? 503 : 200;
      body = state.profile;
    } else if (path === "/admin/profile/avatar" && req.method() === "GET") {
      expect(req.headers().authorization).toMatch(/^Bearer /);
      if (!state.profile.hasAvatar || state.imageFailure)
        return route.fulfill({
          status: state.imageFailure ? 503 : 404,
          headers,
          contentType: "application/json",
          body: "{}",
        });
      return route.fulfill({
        headers: { ...headers, "cache-control": "private, no-store" },
        contentType: "image/webp",
        body: image,
      });
    } else if (
      path === "/admin/profile/avatar" ||
      path === "/admin/profile/avatar/remove"
    ) {
      expect(req.headers().authorization).toMatch(/^Bearer /);
      const removing = path.endsWith("/remove");
      if (removing) state.removals++;
      else state.uploads++;
      const posted = req.postData() ?? "";
      expect(posted).toContain(state.profile.updatedAt);
      status = state.photoFailure ? 503 : state.photoConflict ? 409 : 200;
      if (status === 200)
        state.profile = {
          ...state.profile,
          hasAvatar: !removing,
          updatedAt: new Date(
            Date.parse(state.profile.updatedAt) + 1,
          ).toISOString(),
        };
      body = status === 200 ? state.profile : {};
    } else if (path === "/admin/profile/name") {
      state.saves++;
      const data = req.postDataJSON();
      if (state.holdSave)
        await new Promise<void>((resolve) => {
          unblockSave = resolve;
        });
      status =
        state.conflict || data.expectedUpdatedAt !== state.profile.updatedAt
          ? 409
          : 200;
      if (status === 200)
        state.profile = {
          ...state.profile,
          fullName: data.fullName,
          updatedAt: new Date(
            Date.parse(state.profile.updatedAt) + 1,
          ).toISOString(),
        };
      body = status === 409 ? { code: "PROFILE_CHANGED" } : state.profile;
    } else if (path.endsWith("/dashboard"))
      body = {
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        totalCount: 0,
        recentApplications: [],
      };
    else
      return route.fulfill({
        status: 404,
        headers,
        contentType: "application/json",
        body: "{}",
      });
    return route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return state;
}
async function login(page: Page, c: typeof ar | typeof en) {
  await page.getByLabel(c["auth.email"]).fill("admin@example.com");
  await page
    .getByLabel(c["auth.password"], { exact: true })
    .fill("Synthetic123!");
  await page
    .getByRole("button", { name: c["auth.login"], exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: c["admin.title"] }),
  ).toBeVisible();
}
async function audit(page: Page) {
  await page.addScriptTag({ content: axe.source });
  expect(
    await page.evaluate(async () =>
      (await window.axe.run(document)).violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
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
  await page.evaluate(() => {
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement.classList.contains("skip-link")
    )
      document.activeElement.blur();
  });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
for (const locale of ["ar", "en"] as const) {
  const c = locale === "ar" ? ar : en;
  for (const width of [375, 1440]) {
    test(`Admin photo ${locale} ${width}: preview, private retrieval, replace, cancel and remove (synthetic transport)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await fixture(page, locale);
      await page.goto("/login");
      await login(page, c);
      await page.locator(".admin-account-trigger").click();
      await page
        .getByRole("menuitem", { name: c["profile.myProfile"] })
        .click();
      const png = (await raster({
        create: { width: 24, height: 24, channels: 3, background: "#194b49" },
      })
        .png()
        .toBuffer()) as Buffer;
      const chooserReady = page.waitForEvent("filechooser");
      await page
        .getByRole("button", { name: c["photo.choose"], exact: true })
        .click();
      const chooser = await chooserReady;
      await chooser.setFiles({
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: png,
      });
      await expect(page.getByAltText(c["photo.preview"])).toBeVisible();
      expect(state.uploads).toBe(0);
      await audit(page);
      await capture(page, `${locale}-${width}-photo-preview`);
      await page
        .getByRole("button", { name: c["photo.confirm"], exact: true })
        .click();
      await expect(
        page.getByText(c["photo.saved"], { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".account-avatar img")).toHaveCount(2);
      await page.locator(".admin-account-trigger").click();
      await expect(page.locator(".account-avatar img")).toHaveCount(3);
      expect(
        await page
          .locator(".account-avatar img")
          .evaluateAll((images) =>
            images.every((img) => (img as HTMLImageElement).naturalWidth > 0),
          ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await audit(page);
      await capture(page, `${locale}-${width}-photo-saved`);
      await page.reload();
      await login(page, c);
      await page.locator(".admin-account-trigger").click();
      await page
        .getByRole("menuitem", { name: c["profile.myProfile"] })
        .click();
      await expect(page.locator(".account-avatar img")).toHaveCount(2);
      const old = await page
        .locator(".account-avatar img")
        .first()
        .getAttribute("src");
      await page.getByLabel(c["photo.replace"], { exact: true }).setInputFiles({
        name: "replacement.png",
        mimeType: "image/png",
        buffer: png,
      });
      await page
        .getByRole("button", { name: c["account.cancel"], exact: true })
        .click();
      expect(state.uploads).toBe(1);
      await page.getByLabel(c["photo.replace"], { exact: true }).setInputFiles({
        name: "replacement.png",
        mimeType: "image/png",
        buffer: png,
      });
      await page
        .getByRole("button", { name: c["photo.confirm"], exact: true })
        .click();
      await expect.poll(() => state.uploads).toBe(2);
      await expect(
        page.locator(".account-avatar img").first(),
      ).not.toHaveAttribute("src", old!);
      expect(
        await page.evaluate(async (url) => {
          try {
            await fetch(url!);
            return false;
          } catch {
            return true;
          }
        }, old),
      ).toBe(true);
      await page
        .getByRole("button", { name: c["photo.remove"], exact: true })
        .click();
      await audit(page);
      await capture(page, `${locale}-${width}-photo-removal`);
      await page
        .getByRole("button", { name: c["photo.confirmRemove"], exact: true })
        .click();
      await expect(
        page.getByText(c["photo.removed"], { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".account-avatar img")).toHaveCount(0);
      expect(state.removals).toBe(1);
    });
  }
  test(`Admin photo ${locale}: invalid input, server conflict and retrieval retry are honest`, async ({
    page,
  }) => {
    const state = await fixture(page, locale);
    await page.goto("/login");
    await login(page, c);
    await page.locator(".admin-account-trigger").click();
    await page.getByRole("menuitem", { name: c["profile.myProfile"] }).click();
    await page.getByLabel(c["photo.choose"], { exact: true }).setInputFiles({
      name: "spoof.png",
      mimeType: "image/png",
      buffer: Buffer.from("<svg/>"),
    });
    await expect(
      page.getByText(c["photo.invalid"], { exact: true }),
    ).toBeVisible();
    expect(state.uploads).toBe(0);
    const png = (await raster({
      create: { width: 24, height: 24, channels: 3, background: "white" },
    })
      .png()
      .toBuffer()) as Buffer;
    await page.getByLabel(c["photo.choose"], { exact: true }).setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: png,
    });
    state.photoConflict = true;
    await page
      .getByRole("button", { name: c["photo.confirm"], exact: true })
      .click();
    await expect(
      page.getByText(c["profile.conflict"], { exact: true }),
    ).toBeVisible();
    expect(state.profile.hasAvatar).toBe(false);
    await page
      .getByRole("button", { name: c["account.cancel"], exact: true })
      .click();
    state.photoConflict = false;
    state.imageFailure = true;
    await page.getByLabel(c["photo.choose"], { exact: true }).setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page
      .getByRole("button", { name: c["photo.confirm"], exact: true })
      .click();
    await expect(
      page.getByText(c["photo.loadFailed"], { exact: false }),
    ).toBeVisible();
    await expect(page.locator(".account-avatar img")).toHaveCount(0);
    state.imageFailure = false;
    await page
      .getByRole("button", { name: c["photo.retry"], exact: true })
      .click();
    await expect(page.locator(".account-avatar img")).toHaveCount(2);
  });
  test(`Admin profile ${locale}: native browser zoom at 200 percent`, async ({
    browserName,
  }, info) => {
    expect(browserName).toBe("chromium");
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
      await fixture(page, locale);
      await page.goto("/login");
      await login(page, c);
      expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(2);
      expect(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).zoom,
        ),
      ).toBe("1");
      for (const [label, state] of [
        [c["profile.myProfile"], "profile"],
        [c["profile.settings"], "settings"],
      ] as const) {
        await page.locator(".admin-account-trigger").click();
        await page.getByRole("menuitem", { name: label, exact: true }).click();
        await audit(page);
        await capture(page, `${locale}-zoom-${state}`);
      }
      await page.locator(".admin-account-trigger").click();
      await audit(page);
      await capture(page, `${locale}-zoom-menu`);
    } finally {
      await context.close();
    }
  });
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    test(`Admin profile ${locale} ${width}: real menu interactions and saved name state (synthetic API)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await fixture(page, locale);
      await page.goto("/login");
      await login(page, c);
      const trigger = page.locator(".admin-account-trigger");
      await expect(trigger).toContainText("Synthetic Admin");
      await expect(page.locator(".admin-header")).not.toContainText(
        "admin@example.com",
      );
      await audit(page);
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-dashboard`);
      await trigger.focus();
      await trigger.press("ArrowDown");
      await expect(
        page.getByRole("menuitem", { name: c["profile.myProfile"] }),
      ).toBeFocused();
      await expect(page.locator(".admin-account-menu-email")).toHaveText(
        "admin@example.com",
      );
      const bounds = await page
        .locator(".admin-account-menu-panel")
        .boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("End");
      await expect(
        page.getByRole("menuitem", { name: c["profile.logout"] }),
      ).toBeFocused();
      await page.keyboard.press("Home");
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(page.getByRole("menu")).toHaveCount(0);
      await trigger.press("ArrowDown");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await trigger.click();
      await audit(page);
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-menu`);
      await page.locator(".admin-breadcrumb").click();
      await expect(page.getByRole("menu")).toHaveCount(0);
      await trigger.click();
      await page
        .getByRole("menuitem", { name: c["profile.myProfile"] })
        .click();
      await expect(page).toHaveURL(/\/admin\/profile$/);
      await audit(page);
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-profile`);
      await page
        .getByRole("button", { name: c["profile.edit"], exact: true })
        .click();
      const input = page.getByLabel(c["profile.name"], { exact: true });
      await expect(input).toBeFocused();
      await input.fill("   ");
      await page
        .getByRole("button", { name: c["profile.save"], exact: true })
        .click();
      expect(state.saves).toBe(0);
      await expect(input).toBeFocused();
      await input.fill(
        locale === "ar" ? "مسؤول تجريبي جديد" : "Updated Synthetic Admin",
      );
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-editing`);
      await page
        .getByRole("button", { name: c["profile.save"], exact: true })
        .click();
      await expect(page.getByRole("status")).toHaveText(c["profile.saved"]);
      await expect(trigger).toContainText(state.profile.fullName);
      await trigger.click();
      await page
        .getByRole("menuitem", { name: c["profile.settings"], exact: true })
        .click();
      await expect(page).toHaveURL(/\/admin\/account-settings$/);
      await audit(page);
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-settings`);
      await trigger.click();
      await page
        .getByRole("menuitem", { name: c["profile.security"], exact: true })
        .click();
      await expect(page.locator("#security")).toBeFocused();
      await expect(
        page.getByText(c["profile.passwordUnavailable"], { exact: true }),
      ).toBeVisible();
      if (width === 375 || width === 1440)
        await capture(page, `${locale}-${width}-security`);
      await page.reload();
      await expect(page).toHaveURL(/\/login$/);
      await login(page, c);
      await expect(page.locator(".admin-account-trigger")).toContainText(
        state.profile.fullName,
      );
    });
  }
  test(`Admin profile ${locale}: shared header updates when navigation happens during save`, async ({
    page,
  }) => {
    const state = await fixture(page, locale);
    await page.goto("/login");
    await login(page, c);
    await page.locator(".admin-account-trigger").click();
    await page.getByRole("menuitem", { name: c["profile.myProfile"] }).click();
    await page
      .getByRole("button", { name: c["profile.edit"], exact: true })
      .click();
    await page
      .getByLabel(c["profile.name"], { exact: true })
      .fill("Saved after navigation");
    state.holdSave = true;
    try {
      await page
        .getByRole("button", { name: c["profile.save"], exact: true })
        .click();
      await expect.poll(() => state.saves).toBe(1);
      await expect(
        page.getByRole("button", { name: c["profile.saving"], exact: true }),
      ).toBeDisabled();
      await page.locator(".admin-account-trigger").click();
      await page
        .getByRole("menuitem", { name: c["profile.settings"], exact: true })
        .click();
      await expect(page).toHaveURL(/\/admin\/account-settings$/);
      state.releaseSave();
      await expect(page.locator(".admin-account-name")).toHaveText(
        "Saved after navigation",
      );
      await expect(
        page.getByText("Saved after navigation", { exact: true }),
      ).toHaveCount(2);
      expect(state.saves).toBe(1);
    } finally {
      state.releaseSave();
    }
  });
  test(`Admin profile ${locale}: stale edits, cancellation, safe name fallback and local logout`, async ({
    page,
  }) => {
    const state = await fixture(page, locale);
    state.profile.fullName = state.profile.email;
    await page.goto("/login");
    await login(page, c);
    await expect(page.locator(".admin-account-trigger")).toContainText(
      c["profile.fallback"],
    );
    await page.locator(".admin-account-trigger").click();
    await page.getByRole("menuitem", { name: c["profile.myProfile"] }).click();
    await page
      .getByRole("button", { name: c["profile.edit"], exact: true })
      .click();
    await page
      .getByLabel(c["profile.name"], { exact: true })
      .fill("Conflicting change");
    state.conflict = true;
    await page
      .getByRole("button", { name: c["profile.save"], exact: true })
      .click();
    await expect(
      page.getByText(c["profile.conflict"], { exact: true }),
    ).toBeVisible();
    expect(state.profile.fullName).toBe("admin@example.com");
    await page
      .getByRole("button", { name: c["account.cancel"], exact: true })
      .click();
    await page.locator(".admin-account-trigger").click();
    await page.getByRole("menuitem", { name: c["profile.logout"] }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
      "natiqaac.locale",
    ]);
  });
}
