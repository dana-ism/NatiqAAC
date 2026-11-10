import { expect, test } from "@playwright/test";
import { ar } from "../src/i18n/ar";
import { en } from "../src/i18n/en";

import { workspace } from "./admin.fixture";

for (const locale of ["ar", "en"] as const) {
  test(`Signature ${locale}: recover list and private document errors, reconcile a stale decision`, async ({
    page,
  }) => {
    const copy = locale === "ar" ? ar : en;
    const state = await workspace(page, locale);
    await page.getByRole("link", { name: copy["admin.reviewCta"] }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: copy["account.empty"], exact: true }),
    ).toHaveCount(0);
    state.listFails = false;
    await page
      .getByRole("button", { name: copy["session.retry"], exact: true })
      .click();
    await expect(page.locator(".admin-result-count strong")).toHaveText(
      new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(1),
    );
    const lists = state.lists;
    await page.getByRole("searchbox").fill("no-match");
    await expect(
      page.getByRole("heading", { name: copy["admin.noResults"], exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: copy["admin.clearFilters"] })
      .click();
    expect(state.lists).toBe(lists);
    await page.locator(".admin-row-action").click();
    await page
      .getByRole("button", { name: copy["account.download"], exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    state.documentFails = false;
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: copy["account.download"], exact: true })
      .click();
    expect((await downloadEvent).suggestedFilename()).toBe(
      "qualification-document.pdf",
    );
    state.conflict = true;
    await page
      .getByRole("button", { name: copy["account.approve"], exact: true })
      .click();
    await page
      .getByRole("button", {
        name: copy["account.confirmDecision"],
        exact: true,
      })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page
      .getByRole("button", { name: copy["admin.refreshDetails"], exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: copy["admin.reviewHistory"],
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic prior decision", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy["account.approve"], exact: true }),
    ).toHaveCount(0);
    expect(state.decisions).toBe(1);
  });

  test(`Signature ${locale}: one approval in flight, refreshed results, translated feedback and mobile drawer`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    const copy = locale === "ar" ? ar : en;
    const state = await workspace(page, locale);
    state.listFails = false;
    const menu = page.getByRole("button", {
      name: copy["admin.navigation"],
      exact: true,
    });
    await menu.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Click the backdrop on the opposite side of the RTL/LTR drawer.
    await page.mouse.click(locale === "ar" ? 10 : 365, 450);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(menu).toBeFocused();
    await menu.click();
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(".admin-sidebar nav")).toBeVisible();
    await page.getByRole("link", { name: copy["admin.reviewCta"] }).click();
    await page.locator(".admin-row-action").click();
    await page
      .getByRole("button", { name: copy["account.approve"], exact: true })
      .click();
    const confirm = page.getByRole("button", {
      name: copy["account.confirmDecision"],
      exact: true,
    });
    await confirm.dblclick();
    await expect(confirm).toBeDisabled();
    expect(state.decisions).toBe(1);
    state.release();
    await expect(
      page.getByRole("heading", { name: copy["admin.noResults"], exact: true }),
    ).toBeVisible();
    await expect(page.locator("#admin-applications-heading")).toBeFocused();
    await page
      .getByLabel(copy["admin.filterStatus"], { exact: true })
      .selectOption("ALL");
    await expect(page.locator(".admin-table .admin-status")).toHaveText(
      copy["account.APPROVED"],
    );
    await expect(
      page.getByText(copy["account.decided"], { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: locale === "ar" ? "English" : "العربية",
        exact: true,
      })
      .click();
    const other = locale === "ar" ? en : ar;
    await expect(
      page.getByText(other["account.decided"], { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(copy["account.decided"], { exact: true }),
    ).toHaveCount(0);
    expect(
      Object.keys(await page.evaluate(() => ({ ...localStorage }))),
    ).toEqual(["natiqaac.locale"]);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  });
}
