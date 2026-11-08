import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";
import { localeStorageKey } from "../src/i18n/messages";

declare global {
  interface Window {
    axe: typeof axe;
  }
}

async function accessible(page: Page) {
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
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  );
  expect(violations).toEqual([]);
  // Axe may focus the skip link. Keep that audit side effect out of visual captures.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
}

test.beforeEach(async ({ page }) => {
  await page.route("http://localhost:3000/auth/**", async (route) => {
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
      id: "6fbbe1de-542e-409e-bbec-088c6c084416",
      fullName: "Synthetic Parent",
      email: "parent@example.com",
      role: "PARENT",
      status: "ACTIVE",
    };
    const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature`;
    if (path.endsWith("/login"))
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          message: "Login successful",
          access_token: token,
          user,
        }),
      });
    if (path.endsWith("/register"))
      return route.fulfill({
        status: 201,
        headers,
        body: JSON.stringify({
          message: "Account registered successfully",
          user: { ...user, createdAt: new Date().toISOString() },
        }),
      });
    return route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({
        userId: user.id,
        email: user.email,
        role: user.role,
      }),
    });
  });
});
for (const width of [375, 768, 1440]) {
  test(`RTL forms, responsive layout and accessibility at ${width}px (mocked API)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("heading", { name: "سعيدون بوجودك هنا." }),
    ).toBeVisible();
    await expect(page.getByLabel("البريد الإلكتروني")).not.toBeDisabled();
    await accessible(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/login-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "إنشاء حساب", exact: true }).click();
    await page.getByLabel("الاسم الكامل").fill("Synthetic Parent");
    await page.getByLabel("البريد الإلكتروني").fill("parent@example.com");
    await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
    await page.getByLabel("كلمة المرور", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "إظهار كلمة المرور" }),
    ).toBeFocused();
    await page.keyboard.press("Space");
    await expect(
      page.getByLabel("كلمة المرور", { exact: true }),
    ).toHaveAttribute("type", "text");
    await accessible(page);
    await page.screenshot({
      path: `test-results/register-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /^إنشاء حساب ولي أمر/ }).click();
    await expect(
      page.getByText("تم إنشاء حسابك بنجاح. يمكنك الآن تسجيل الدخول."),
    ).toBeVisible();
    await page.getByLabel("البريد الإلكتروني").fill("parent@example.com");
    await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
    await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
    await expect(
      page.getByText("parent@example.com", { exact: true }),
    ).toBeVisible();
    await accessible(page);
    await expect(
      page.getByText("6fbbe1de-542e-409e-bbec-088c6c084416"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "تم تسجيل الدخول" }),
    ).toHaveCount(1);
    const bubble = await page
      .locator(".welcome-page .note-bottom")
      .boundingBox();
    const bar = await page.locator(".welcome-page .message-card").boundingBox();
    expect(bubble).not.toBeNull();
    expect(bar).not.toBeNull();
    expect(bubble!.y).toBeGreaterThan(bar!.y + bar!.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
    const discover = page.getByRole("button", { name: "اكتشف ما ينتظرك" });
    await discover.focus();
    await expect(discover).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "تجارب جديدة في الطريق" }),
    ).toBeFocused();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await expect(
      page.getByRole("heading", { name: "تجارب جديدة في الطريق" }),
    ).toBeInViewport();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await discover.click();
    await expect(
      page.getByRole("heading", { name: "تجارب جديدة في الطريق" }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
    ).toBe(0);
    await page.getByRole("button", { name: /^تسجيل الخروج/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login$/);
  });
}
test("welcome reflows with a long email and 200% CSS zoom (mocked API)", async ({
  page,
}) => {
  const email = `${"parent".repeat(10)}@example.com`;
  await page.route("http://localhost:3000/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId: "6fbbe1de-542e-409e-bbec-088c6c084416",
        email,
        role: "PARENT",
      }),
    }),
  );
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("parent@example.com");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  for (const zoom of ["1", "2"]) {
    await page.setViewportSize({
      width: zoom === "1" ? 375 : 1440,
      height: 1000,
    });
    await page.evaluate((value) => {
      document.body.style.zoom = value;
    }, zoom);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const name of ["اكتشف ما ينتظرك", "تسجيل الخروج"]) {
      const box = await page
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  }
});

for (const width of [375, 768, 1440]) {
  test(`Arabic/English navigation, persistence and accessible reflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    const english = page.getByRole("button", { name: "English", exact: true });
    await english.focus();
    await page.keyboard.press("Enter");
    await expect(english).toBeFocused();
    await expect(english).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page).toHaveTitle("Sign in | Natiq");
    await accessible(page);
    await page.screenshot({
      path: `test-results/login-en-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: en["auth.register"], exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: en["auth.registerTitle"] }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.getByRole("button", { name: "العربية", exact: true }).click();
    await expect(page.getByLabel(ar["auth.fullName"])).toBeVisible();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await accessible(page);
    await page.screenshot({
      path: `test-results/register-en-${width}.png`,
      fullPage: true,
    });
    await page.getByLabel(en["auth.fullName"]).fill("Synthetic Parent");
    await page.getByLabel(en["auth.email"]).fill("parent@example.com");
    await page
      .getByLabel(en["auth.password"], { exact: true })
      .fill("TestPass123!");
    await page
      .getByRole("button", { name: en["auth.createParent"], exact: true })
      .click();
    await expect(page.getByText(en["auth.registered"])).toBeVisible();
    await page.getByLabel(en["auth.email"]).fill("parent@example.com");
    await page
      .getByLabel(en["auth.password"], { exact: true })
      .fill("TestPass123!");
    await page
      .getByRole("button", { name: en["auth.login"], exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: en["home.title"] }),
    ).toBeVisible();
    await expect(
      page.getByText(en["role.PARENT"], { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("parent@example.com", { exact: true }),
    ).toHaveAttribute("dir", "ltr");
    await accessible(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bubble = await page.locator(".note-bottom").boundingBox();
    const bar = await page.locator(".message-card").boundingBox();
    expect(bubble!.y).toBeGreaterThan(bar!.y + bar!.height);
    // Native language names remain in their own script; the rest of English copy is English.
    expect(
      (await page.locator("body").innerText()).replaceAll("العربية", ""),
    ).not.toMatch(/[\u0600-\u06ff]/);
    await page.screenshot({
      path: `test-results/home-en-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: en["home.discover"] }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: en["home.futureTitle"] }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", { name: en["home.futureTitle"] }),
    ).toBeInViewport();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: en["home.discover"] }).click();
    await expect(
      page.getByRole("heading", { name: en["home.futureTitle"] }),
    ).toBeInViewport();
    if (width === 1440) {
      await page.evaluate(() => {
        document.body.style.zoom = "2";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "test-results/home-en-zoom-200.png",
        fullPage: true,
      });
      await page.evaluate(() => {
        document.body.style.zoom = "1";
      });
    }
    await page.getByRole("button", { name: "العربية", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("heading", { name: ar["home.title"] }),
    ).toBeVisible();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: en["home.title"] }),
    ).toBeVisible();
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({
      [localeStorageKey]: "en",
    });
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    await page
      .getByRole("button", { name: en["home.signOut"], exact: true })
      .click();
    await expect(page.getByText(en["session.signedOut"])).toBeVisible();
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: en["auth.loginTitle"] }),
    ).toBeVisible();
  });
}

test("idle expiry removes protected content (mocked API)", async ({ page }) => {
  await page.route("http://localhost:3000/auth/login", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": new URL(
          String(test.info().project.use.baseURL),
        ).origin,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "Login successful",
        access_token: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3 })).toString("base64url")}.signature`,
        user: {
          id: "test",
          fullName: "Synthetic Parent",
          email: "parent@example.com",
          role: "PARENT",
          status: "ACTIVE",
        },
      }),
    }),
  );
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("parent@example.com");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
  await expect(
    page.getByText("parent@example.com", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/, { timeout: 7000 });
  await expect(
    page.getByText("parent@example.com", { exact: true }),
  ).toHaveCount(0);
});

for (const [status, expected] of [
  [401, "البريد الإلكتروني أو كلمة المرور غير صحيحة."],
  [429, "طلبات كثيرة"],
  [503, "الخدمة غير متاحة مؤقتًا."],
] as const) {
  test(`readable HTTP ${status} is not classified as a network failure (controlled response)`, async ({
    page,
  }) => {
    await page.route("http://localhost:3000/auth/login", (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      return route.fulfill({
        status,
        headers: {
          "access-control-allow-origin": new URL(
            String(test.info().project.use.baseURL),
          ).origin,
          "content-type": "application/json",
          "retry-after": "30",
          "access-control-expose-headers": "Retry-After",
        },
        body: JSON.stringify({
          statusCode: status,
          message: "Synthetic test response",
        }),
      });
    });
    await page.goto("/login");
    await page.getByLabel("البريد الإلكتروني").fill("synthetic@example.com");
    await page
      .getByLabel("كلمة المرور", { exact: true })
      .fill("SyntheticPass123!");
    await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
    await expect(page.getByRole("alert")).toContainText(expected);
    await expect(page.getByRole("alert")).not.toContainText(
      "تعذّر الاتصال بالخدمة",
    );
  });
}

test("an actual fetch transport failure retains the network message (controlled abort)", async ({
  page,
}) => {
  await page.route("http://localhost:3000/auth/login", (route) =>
    route.abort("connectionrefused"),
  );
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("synthetic@example.com");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("SyntheticPass123!");
  await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
  await expect(page.getByRole("alert")).toContainText("تعذّر الاتصال بالخدمة");
});
