import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { workspace } from "./admin.fixture";
import { futureAdminSections } from "../src/features/admin/admin-sections";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";

async function accessible(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    navigationOverlap: Array.from(
      document.querySelectorAll(
        ".admin-sidebar nav a, .admin-drawer[open] nav a",
      ),
    ).some((link) => {
      const title = link.querySelector<HTMLElement>(
        ":scope > span:not(.admin-nav-badge)",
      );
      const badge = link.querySelector<HTMLElement>(".admin-nav-badge");
      if (!title || !badge || !link.getBoundingClientRect().height)
        return false;
      const a = title.getBoundingClientRect(),
        b = badge.getBoundingClientRect();
      return (
        (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) ||
        title.scrollWidth > title.clientWidth + 1
      );
    }),
    violations: (await window.axe.run()).violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  }));
  expect(result.overflow).toBe(false);
  expect(result.navigationOverlap).toBe(false);
  expect(result.violations).toEqual([]);
}
for (const locale of ["ar", "en"] as const) {
  const copy = locale === "ar" ? ar : en;
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    test(`Admin V2 ${locale} ${width}px: all future sections, direct entry, shared navigation and accessibility`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const state = await workspace(page, locale, "/admin/users");
      const startCalls = state.dashboardCalls;
      for (const [index, section] of futureAdminSections.entries()) {
        if (index > 0) {
          if (width <= 900)
            await page
              .getByRole("button", {
                name: copy["admin.navigation"],
                exact: true,
              })
              .click();
          await page
            .getByRole("link", { name: new RegExp("^" + copy[section.title]) })
            .click();
        }
        await expect(page).toHaveURL(new RegExp(section.path + "$"));
        await expect(
          page.getByRole("heading", {
            name: copy[section.title],
            level: 1,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByText(copy[section.description], { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: copy["adminV2.inDevelopment"],
            exact: true,
          }),
        ).toBeVisible();
        await expect(page).toHaveTitle(
          `${copy[section.title]} | ${copy["brand.name"]}`,
        );
        await expect(page.locator(".admin-shell")).toHaveCount(1);
        await expect(page.getByRole("table")).toHaveCount(0);
        await expect(
          page.getByText(copy["adminV2.frontendOnlyHelp"], { exact: true }),
        ).toBeVisible();
        expect(
          await page.locator(".admin-foundation-card").count(),
        ).toBeGreaterThan(0);
        expect(state.dashboardCalls).toBe(startCalls);
        await accessible(page);
      }
      await page
        .getByRole("button", {
          name: locale === "ar" ? "English" : "العربية",
          exact: true,
        })
        .click();
      const other = locale === "ar" ? en : ar;
      await expect(
        page.getByRole("heading", {
          name: other["adminV2.audit"],
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "ltr" : "rtl",
      );
      expect(state.dashboardCalls).toBe(startCalls);
      await page
        .getByRole("link", { name: other["adminV2.backOverview"], exact: true })
        .click();
      await page.locator(".admin-pending-count strong").waitFor();
      if (width <= 900)
        await page
          .getByRole("button", { name: other["admin.navigation"], exact: true })
          .click();
      await page
        .getByRole("link", { name: new RegExp("^" + other["adminV2.audit"]) })
        .click();
      await page.reload();
      await expect(page).toHaveURL(/\/login$/);
      await page.locator("#email").fill("admin@example.com");
      await page.locator("#password").fill("Synthetic123!");
      await page.locator("form button.primary-button").click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.locator(".admin-pending-count strong")).toHaveText(
        new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(1),
      );
      expect(state.dashboardCalls).toBeGreaterThanOrEqual(startCalls + 2);
    });
  }
  test(`Admin V2 ${locale}: real-shaped metrics, newest requests and direct details outside the old list`, async ({
    page,
  }) => {
    const state = await workspace(page, locale);
    state.listFails = false;
    const recent = {
      id: "synthetic-recent",
      fullName: "Synthetic Specialist",
      email: "specialist@example.com",
      specialization: "Communication",
      qualification: "Synthetic qualification",
      status: "PENDING_REVIEW" as const,
      submittedAt: "2026-11-10T10:00:00Z",
    };
    state.dashboard = {
      pendingCount: 140,
      approvedCount: 12,
      rejectedCount: 3,
      totalCount: 160,
      recentApplications: [
        recent,
        {
          ...recent,
          id: "synthetic-older",
          fullName: "Synthetic Older",
          status: "APPROVED",
          submittedAt: "2026-11-09T10:00:00Z",
        },
      ],
    };
    await page
      .getByRole("link", { name: new RegExp("^" + copy["adminV2.users"]) })
      .click();
    await page
      .getByRole("link", { name: copy["adminV2.backOverview"], exact: true })
      .click();
    for (const [key, value] of Object.entries({
      pendingCount: 140,
      approvedCount: 12,
      rejectedCount: 3,
      totalCount: 160,
    }))
      await expect(page.locator(`[data-stat="${key}"] strong`)).toHaveText(
        new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(
          value,
        ),
      );
    await expect(
      page.locator(".admin-recent-table tbody tr").first(),
    ).toContainText("Synthetic Specialist");
    await expect(page.locator(".admin-verification-card")).toContainText(
      "Synthetic qualification",
    );
    await expect(page.locator(".admin-verification-card")).toContainText(
      "Synthetic Specialist",
    );
    await accessible(page);
    state.holdList = true;
    await page
      .getByRole("link", {
        name: copy["adminV2.openSecureReview"],
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/application=synthetic-recent/);
    await expect(
      page.getByRole("heading", { name: "Synthetic Specialist", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: copy["account.back"], exact: true })
      .click();
    await expect(page).not.toHaveURL(/application=/);
    await expect.poll(() => state.lists).toBeGreaterThan(0);
    state.releaseList();
    await expect(page.locator("#admin-applications-heading")).toBeFocused();
    expect(state.decisions).toBe(0);
  });
  test(`Admin V2 ${locale}: unavailable is not zero, retry and empty alerts are truthful`, async ({
    page,
  }) => {
    const state = await workspace(page, locale);
    state.dashboardFails = true;
    await page
      .getByRole("link", { name: new RegExp("^" + copy["adminV2.content"]) })
      .click();
    await page
      .getByRole("link", { name: copy["adminV2.backOverview"], exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".admin-statistics strong")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: copy["adminV2.noAlerts"],
        exact: true,
      }),
    ).toHaveCount(0);
    state.dashboardFails = false;
    state.dashboard = {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      totalCount: 0,
      recentApplications: [],
    };
    await page
      .getByRole("button", { name: copy["session.retry"], exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: copy["adminV2.noAlerts"],
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: copy["adminV2.noRecent"],
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".admin-statistics strong")).toHaveCount(4);
    await accessible(page);
    state.dashboard.recentApplications = [
      {
        id: "missing",
        fullName: "Synthetic Missing",
        email: "missing@example.com",
        specialization: "Synthetic",
        qualification: "Synthetic",
        status: "PENDING_REVIEW",
        submittedAt: "2026-11-10T10:00:00Z",
      },
    ];
    state.dashboard.totalCount = 1;
    state.dashboard.pendingCount = 1;
    await page
      .getByRole("link", { name: new RegExp("^" + copy["adminV2.content"]) })
      .click();
    await page
      .getByRole("link", { name: copy["adminV2.backOverview"], exact: true })
      .click();
    await page
      .getByRole("link", {
        name: `${copy["adminV2.reviewRequest"]}: Synthetic Missing`,
        exact: true,
      })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    state.missingFound = true;
    await page
      .getByRole("button", { name: copy["admin.refreshDetails"], exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Specialist", exact: true }),
    ).toBeFocused();
    expect(state.decisions).toBe(0);
  });
}
