import { savedAdminProfile } from "./profile.fixture";
import { expect, test, type Page } from "@playwright/test";
import type { AdminDashboard } from "../src/features/admin/admin.api";
export async function workspace(
  page: Page,
  locale: "ar" | "en",
  entry = "/login",
) {
  const state = {
    listFails: true,
    documentFails: true,
    conflict: false,
    status: "PENDING_REVIEW",
    lists: 0,
    decisions: 0,
    dashboardCalls: 0,
    dashboardFails: false,
    missingFound: false,
    holdList: false,
    releaseList: () => {},
    dashboard: {
      pendingCount: 1,
      approvedCount: 0,
      rejectedCount: 0,
      totalCount: 1,
      recentApplications: [],
    } as AdminDashboard,
    release: () => {},
  };
  const application = (id = "synthetic-application") => ({
    id,
    fullName: "Synthetic Specialist",
    email: "specialist@example.com",
    specialization: "Communication",
    qualification: "Synthetic qualification",
    summary: null,
    status: state.status,
    submittedAt: "2026-11-09T10:00:00Z",
    hasDocument: true,
    reviews:
      state.status === "REJECTED"
        ? [
            {
              decision: "REJECTED",
              reason: "Synthetic prior decision",
              createdAt: "2026-11-10T10:00:00Z",
            },
          ]
        : [],
  });
  await page.addInitScript(
    (l) => localStorage.setItem("natiqaac.locale", l),
    locale,
  );
  await page.route("http://localhost:3000/**", async (route) => {
    const r = route.request(),
      path = new URL(r.url()).pathname;
    const headers = {
      "access-control-allow-origin": new URL(
        String(test.info().project.use.baseURL),
      ).origin,
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST",
      "content-type": "application/json",
    };
    if (r.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    let body: unknown,
      status = 200;
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
    else if (path.endsWith("/dashboard")) {
      state.dashboardCalls++;
      status = state.dashboardFails ? 503 : 200;
      body = state.dashboardFails ? {} : state.dashboard;
    } else if (path === "/admin/specialist-applications") {
      state.lists++;
      if (state.holdList)
        await new Promise<void>((resolve) => {
          state.releaseList = resolve;
        });
      status = state.listFails ? 503 : 200;
      body = state.listFails ? {} : { applications: [application()] };
    } else if (path.endsWith("/document")) {
      expect(r.headers().authorization).toMatch(/^Bearer /);
      return route.fulfill({
        status: state.documentFails ? 503 : 200,
        headers: {
          ...headers,
          "content-type": state.documentFails
            ? "application/json"
            : "application/pdf",
        },
        body: state.documentFails ? "{}" : "%PDF-1.4\nSynthetic fixture\n%%EOF",
      });
    } else if (path.endsWith("/approve")) {
      state.decisions++;
      if (state.conflict) {
        state.status = "REJECTED";
        status = 409;
        body = {};
      } else {
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
        state.status = "APPROVED";
        body = { message: "ok" };
      }
    } else if (path.endsWith("/synthetic-application"))
      body = { application: application() };
    else if (path.endsWith("/synthetic-recent"))
      body = { application: application("synthetic-recent") };
    else if (path.endsWith("/missing")) {
      status = state.missingFound ? 200 : 404;
      body = state.missingFound ? { application: application("missing") } : {};
    } else throw new Error(`Unexpected fixture endpoint ${path}`);
    return route.fulfill({ status, headers, body: JSON.stringify(body) });
  });
  await page.goto(entry);
  await page.locator("#email").fill("admin@example.com");
  await page.locator("#password").fill("Synthetic123!");
  await page.locator("form button.primary-button").click();
  await page.locator(".admin-pending-count strong").waitFor();
  if (entry !== "/login") {
    const menu = page.locator(".admin-menu-toggle");
    if (await menu.isVisible()) await menu.click();
    await page.locator(`nav:visible a[href="${entry}"]`).click();
    await page.locator(".admin-coming-panel").waitFor();
  }
  return state;
}
