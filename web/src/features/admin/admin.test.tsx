import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "../../app/App";
import { SessionProvider } from "../auth/SessionProvider";
import { ar } from "../../i18n/ar";
import { en } from "../../i18n/en";

let fetchMock: ReturnType<typeof vi.fn>;
const email = "admin@example.com";
const token = () =>
  `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }))}.signature`;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:3000");
  fetchMock = vi.fn();
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
  expect(await screen.findByText(ar["admin.accessVerified"])).toBeVisible();
  expect(fetchMock.mock.calls[2][1].headers.Authorization).toMatch(/^Bearer /);
  expect(screen.queryByText("synthetic-id")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    en["admin.title"],
  );
  expect(document.documentElement).toHaveAttribute("dir", "ltr");
  expect(localStorage.getItem("natiqaac.locale")).toBe("en");
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await userEvent.click(
    screen.getByRole("button", { name: en["home.signOut"] }),
  );
  expect(await screen.findByText(en["session.signedOut"])).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(3);
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
