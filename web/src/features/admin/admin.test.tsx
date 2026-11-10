import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "../../app/App";
import { SessionProvider } from "../auth/SessionProvider";
import { ar } from "../../i18n/ar";
import { en } from "../../i18n/en";
import { futureAdminSections } from "./admin-sections";

const dashboard = (pendingCount: number) => ({
  pendingCount,
  approvedCount: 0,
  rejectedCount: 0,
  totalCount: pendingCount,
  recentApplications: [],
});
let fetchMock: ReturnType<typeof vi.fn>;
const email = "admin@example.com";
const token = () =>
  `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }))}.signature`;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:3000");
  fetchMock = vi.fn().mockResolvedValue(json(dashboard(0)));
  vi.stubGlobal("fetch", fetchMock);
});
function mount(path = "/admin") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}
async function login(role = "ADMIN", identityStatus = 200) {
  fetchMock
    .mockResolvedValueOnce(
      json({
        message: "ok",
        access_token: token(),
        user: {
          id: "synthetic-id",
          fullName: "Synthetic",
          email,
          role,
          status: "ACTIVE",
        },
      }),
    )
    .mockResolvedValueOnce(
      json({ userId: "synthetic-id", email, role }, identityStatus),
    );
  fireEvent.change(screen.getByLabelText(ar["auth.email"]), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(ar["auth.password"]), {
    target: { value: "SyntheticPass123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: ar["auth.login"] }));
}
it("redirects anonymous users through the existing login flow", () => {
  mount();
  expect(screen.getByLabelText(ar["auth.email"])).toBeVisible();
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each(["PARENT", "SPECIALIST"])(
  "keeps %s out of Admin and never requests admin data",
  async (role) => {
    mount();
    await login(role);
    expect(await screen.findByText(email)).toBeVisible();
    expect(screen.queryByText(ar["admin.title"])).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);
it("loads backend-projected identity, translates without refetch and signs out locally", async () => {
  mount();
  await login();
  fetchMock.mockResolvedValueOnce(json({ account: { email, role: "ADMIN" } }));
  expect(await screen.findByText(ar["admin.accountTitle"])).toBeVisible();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  expect(
    screen.queryByText(ar["admin.accessVerified"]),
  ).not.toBeInTheDocument();
  expect(fetchMock.mock.calls[2][1].headers.Authorization).toMatch(/^Bearer /);
  expect(screen.queryByText("synthetic-id")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    en["admin.title"],
  );
  expect(document.documentElement).toHaveAttribute("dir", "ltr");
  expect(localStorage.getItem("natiqaac.locale")).toBe("en");
  expect(fetchMock).toHaveBeenCalledTimes(4);
  await userEvent.click(
    screen.getByRole("button", { name: en["home.signOut"] }),
  );
  expect(await screen.findByText(en["session.signedOut"])).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(Object.keys(localStorage)).toEqual(["natiqaac.locale"]);
});
it.each([401, 403])(
  "clears a session when Admin access is rejected with %s",
  async (status) => {
    mount();
    await login();
    fetchMock.mockResolvedValueOnce(json({}, status));
    expect(await screen.findByText(ar["error.session"])).toBeVisible();
    expect(screen.queryByText(email)).not.toBeInTheDocument();
  },
);
it("rejects an inactive identity before loading Admin", async () => {
  mount();
  await login("ADMIN", 401);
  expect(await screen.findByText(ar["error.session"])).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("hides protected data on service failure and supports explicit retry", async () => {
  mount();
  await login();
  fetchMock.mockResolvedValueOnce(json({}, 503));
  expect(await screen.findByText(ar["admin.unavailable"])).toBeVisible();
  expect(screen.queryByText(email)).not.toBeInTheDocument();
  fetchMock.mockResolvedValueOnce(json({ account: { email, role: "ADMIN" } }));
  fireEvent.click(screen.getByRole("button", { name: ar["session.retry"] }));
  await waitFor(() => expect(screen.getByText(email)).toBeVisible());
});

it.each([0, 3, 140])(
  "shows the actual pending count %s, with no fabricated verification badge",
  async (pendingCount) => {
    mount();
    await login();
    fetchMock
      .mockResolvedValueOnce(
        json({ account: { email, role: "ADMIN", emailVerified: false } }),
      )
      .mockResolvedValueOnce(json(dashboard(pendingCount)));
    await screen.findByText(email);
    await waitFor(() =>
      expect(
        document.querySelector(".admin-pending-count strong"),
      ).toHaveTextContent(
        new Intl.NumberFormat("ar", { numberingSystem: "latn" }).format(
          pendingCount,
        ),
      ),
    );
    expect(
      screen.queryByText(ar["admin.accessVerified"]),
    ).not.toBeInTheDocument();
    if (pendingCount > 0)
      expect(
        screen.getByRole("link", { name: ar["admin.reviewCta"] }),
      ).toHaveAttribute(
        "href",
        "/admin/specialist-applications?status=PENDING_REVIEW",
      );
    if (pendingCount === 0)
      expect(screen.getByText(ar["admin.noPending"])).toBeVisible();
  },
);

it("announces a loading summary without briefly fabricating an empty queue", async () => {
  let resolveSummary!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    resolveSummary = resolve;
  });
  mount();
  await login();
  fetchMock
    .mockResolvedValueOnce(json({ account: { email, role: "ADMIN" } }))
    .mockReturnValueOnce(pending);
  await screen.findByText(email);
  await waitFor(() =>
    expect(document.querySelector(".admin-pending-count")).toHaveAttribute(
      "aria-busy",
      "true",
    ),
  );
  expect(document.querySelector(".admin-pending-count strong")).toBeNull();
  expect(screen.queryByText(ar["admin.noPending"])).not.toBeInTheDocument();
  resolveSummary(json(dashboard(2)));
  await waitFor(() =>
    expect(document.querySelector(".admin-pending-count")).toHaveAttribute(
      "aria-busy",
      "false",
    ),
  );
  expect(
    document.querySelector(".admin-pending-count strong"),
  ).toHaveTextContent(
    new Intl.NumberFormat("ar", { numberingSystem: "latn" }).format(2),
  );
});

it("does not show zero when the summary fails and retries without reloading the account", async () => {
  mount();
  await login();
  fetchMock
    .mockResolvedValueOnce(json({ account: { email, role: "ADMIN" } }))
    .mockResolvedValueOnce(json({}, 503));
  expect(await screen.findAllByText(ar["admin.countUnavailable"])).toHaveLength(
    4,
  );
  expect(document.querySelector(".admin-pending-count strong")).toBeNull();
  expect(screen.getByText(email)).toBeVisible();
  fetchMock.mockResolvedValueOnce(json(dashboard(8)));
  await userEvent.click(
    screen.getByRole("button", { name: ar["session.retry"] }),
  );
  await waitFor(() =>
    expect(
      document.querySelector(".admin-pending-count strong"),
    ).toHaveTextContent(
      new Intl.NumberFormat("ar", { numberingSystem: "latn" }).format(8),
    ),
  );
  expect(
    fetchMock.mock.calls.filter(([url]) => url.endsWith("/admin/overview")),
  ).toHaveLength(1);
});

it("rejects a malformed summary without treating it as an empty queue", async () => {
  mount();
  await login();
  fetchMock
    .mockResolvedValueOnce(json({ account: { email, role: "ADMIN" } }))
    .mockResolvedValueOnce(json(dashboard(-1)));
  expect(await screen.findAllByText(ar["admin.countUnavailable"])).toHaveLength(
    4,
  );
  expect(screen.queryByText(ar["admin.noPending"])).not.toBeInTheDocument();
});

it("keeps one shared Admin layout and switches the single current navigation destination", async () => {
  mount();
  await login();
  fetchMock
    .mockResolvedValueOnce(json({ account: { email, role: "ADMIN" } }))
    .mockResolvedValueOnce(json(dashboard(0)));
  await screen.findByText(email);
  expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(
    1,
  );
  fetchMock.mockResolvedValueOnce(json({ applications: [] }));
  await userEvent.click(
    screen.getByRole("link", { name: ar["account.applications"] }),
  );
  expect(await screen.findByText(ar["account.empty"])).toBeVisible();
  expect(
    screen.getByRole("link", { name: ar["account.applications"] }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    screen.getByRole("link", { name: ar["admin.overview"] }),
  ).not.toHaveAttribute("aria-current");
  expect(document.querySelectorAll(".admin-shell")).toHaveLength(1);
});

it.each(futureAdminSections)(
  "protects anonymous direct navigation to $path",
  (section) => {
    mount(section.path);
    expect(screen.getByLabelText(ar["auth.email"])).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
for (const role of ["PARENT", "SPECIALIST"]) {
  it.each(futureAdminSections)(
    `${role} cannot enter $path or request Admin data`,
    async (section) => {
      mount(section.path);
      await login(role);
      await screen.findByText(email);
      expect(
        screen.queryByText(ar["adminV2.inDevelopment"]),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
}
it.each(futureAdminSections)(
  "opens the real localized future route $path without a fabricated API",
  async (section) => {
    mount();
    await login();
    fetchMock.mockResolvedValueOnce(
      json({ account: { email, role: "ADMIN" } }),
    );
    await screen.findByText(email);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await userEvent.click(
      screen.getByRole("link", { name: new RegExp("^" + ar[section.title]) }),
    );
    expect(
      await screen.findByRole("heading", { name: ar[section.title], level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: new RegExp("^" + ar[section.title]) }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(ar[section.description])).toBeVisible();
    expect(document.querySelectorAll("nav a")).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await userEvent.click(
      screen.getAllByRole("button", { name: "English" }).at(-1)!,
    );
    expect(
      screen.getByRole("heading", { name: en[section.title], level: 1 }),
    ).toBeVisible();
    expect(screen.getByText(en[section.description])).toBeVisible();
    expect(screen.getByText(en["adminV2.frontendOnlyHelp"])).toBeVisible();
    expect(
      document.querySelectorAll(".admin-foundation-card").length,
    ).toBeGreaterThan(0);
    if (section.path === "/admin/settings") {
      expect(screen.getByText(en["adminV2.availableNow"])).toBeVisible();
      expect(localStorage.getItem("natiqaac.locale")).toBe("en");
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await userEvent.click(
      screen.getByRole("link", { name: en["adminV2.backOverview"] }),
    );
    expect(
      await screen.findByRole("heading", { name: en["admin.title"], level: 1 }),
    ).toBeVisible();
  },
);
