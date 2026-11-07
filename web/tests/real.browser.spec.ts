import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

// Opt-in only. The operator must inspect the dedicated containers before attesting.
test.skip(
  process.env.NATIQ_WEB_REAL_API !== "YES",
  "Requires an inspected isolated backend at localhost:3100",
);
test("real browser registration, login, current user, reload and local sign-out", async ({
  page,
}) => {
  test.skip(
    process.env.NATIQ_WEB_EXPECT_CORS_BLOCK === "YES",
    "Pre-fix reproduction run",
  );
  const backendRequire = createRequire(
    new URL("../../backend/package.json", import.meta.url),
  );
  const { isolatedTestEnvironment } =
    await import("../../backend/test/test-environment");
  const settings = isolatedTestEnvironment(process.env);
  const { PrismaClient } = backendRequire("./dist/generated/prisma/client.js");
  const { PrismaPg } = backendRequire("@prisma/adapter-pg");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: settings.databaseUrl }),
  });
  const email = `web-auth-${randomUUID()}@example.com`;
  const password = randomUUID() + "!";
  let id: string | undefined;
  try {
    await page.goto("/register");
    await page.getByLabel("الاسم الكامل").fill("Synthetic Web Parent");
    await page.getByLabel("البريد الإلكتروني").fill(email);
    await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
    const registration = page.waitForResponse(
      (r) =>
        r.url() === "http://localhost:3100/auth/register" &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^إنشاء حساب ولي أمر/ }).click();
    const response = await registration;
    expect(response.status()).toBe(201);
    const body = await response.json();
    id = body.user.id;
    expect(body.user).not.toHaveProperty("passwordHash");
    await expect(
      page.getByText("تم إنشاء حسابك بنجاح. يمكنك الآن تسجيل الدخول."),
    ).toBeVisible();
    // This error must remain readable across origins instead of becoming a fetch error.
    await page.getByLabel("البريد الإلكتروني").fill(email);
    await page.getByLabel("كلمة المرور", { exact: true }).fill(randomUUID());
    const rejected = page.waitForResponse(
      (r) => r.url().endsWith("/auth/login") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
    expect((await rejected).status()).toBe(401);
    await expect(page.getByRole("alert")).toContainText(
      "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    );
    await page.getByLabel("البريد الإلكتروني").fill(email);
    await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
    await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByText(id!, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
    ).toBe(0);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("البريد الإلكتروني").fill(email);
    await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
    await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^تسجيل الخروج/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login$/);
    const unauthenticated = await page.evaluate(async () => {
      const response = await fetch("http://localhost:3100/auth/me", {
        credentials: "omit",
      });
      return response.status;
    });
    expect(unauthenticated).toBe(401);
    // Trigger the actual account lock only for this synthetic identity on test Redis.
    for (let failure = 0; failure < 5; failure++) {
      await page.getByLabel("البريد الإلكتروني").fill(email);
      await page.getByLabel("كلمة المرور", { exact: true }).fill(randomUUID());
      const failedLogin = page.waitForResponse(
        (r) =>
          r.url().endsWith("/auth/login") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
      expect((await failedLogin).status()).toBe(failure === 4 ? 429 : 401);
      await expect(page.getByRole("alert")).toContainText(
        failure === 4
          ? "طلبات كثيرة"
          : "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      );
    }
  } finally {
    // Scoped to this run's synthetic identity on the explicitly validated test DB.
    try {
      if (id) await prisma.user.deleteMany({ where: { id, email } });
      const { createClient } = backendRequire("redis");
      const { createHash } = backendRequire("node:crypto");
      const redis = createClient({
        url: settings.redisUrl,
        disableOfflineQueue: true,
        socket: { connectTimeout: 3000, reconnectStrategy: false },
      });
      redis.on("error", () => {});
      try {
        await redis.connect();
        const prefix =
          "auth:login:" + createHash("sha256").update(email).digest("hex");
        await redis.del(
          ["failures", "stage", "lock"].map((suffix) => prefix + ":" + suffix),
        );
      } finally {
        if (redis.isOpen) redis.destroy();
      }
    } finally {
      await prisma.$disconnect();
    }
  }
});

test("reproduces the missing-CORS connection error without sending a login POST", async ({
  page,
}) => {
  test.skip(
    process.env.NATIQ_WEB_EXPECT_CORS_BLOCK !== "YES",
    "Explicit isolated pre-fix reproduction only",
  );
  const network = await page.context().newCDPSession(page);
  await network.send("Network.enable");
  const preflights: { status: number; allowOrigin: unknown }[] = [];
  network.on("Network.responseReceived", (event) => {
    if (
      event.type === "Preflight" &&
      event.response.url.endsWith("/auth/login")
    ) {
      preflights.push({
        status: event.response.status,
        allowOrigin: event.response.headers["Access-Control-Allow-Origin"],
      });
    }
  });
  await page.goto("/login");
  await page
    .getByLabel("البريد الإلكتروني")
    .fill(`cors-repro-${randomUUID()}@example.com`);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(randomUUID());
  await page.getByRole("button", { name: /^تسجيل الدخول/ }).click();
  await expect(page.getByRole("alert")).toContainText("تعذّر الاتصال بالخدمة");
  expect(preflights).toContainEqual({ status: 404, allowOrigin: undefined });
});
