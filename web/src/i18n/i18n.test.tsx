import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";
import { SessionProvider } from "../features/auth/SessionProvider";
import { ApiError, errorMessage } from "../shared/api";
import { ar, type MessageKey } from "./ar";
import { en } from "./en";
import { localeStorageKey, translator } from "./messages";

const identity = {
  userId: "synthetic-id",
  email: "parent@example.com",
  role: "PARENT",
};
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:3000");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
function mount(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}
function json(body: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
function fill() {
  fireEvent.change(screen.getByLabelText(en["auth.email"]), {
    target: { value: identity.email },
  });
  fireEvent.change(screen.getByLabelText(en["auth.password"]), {
    target: { value: "TestPass123!" },
  });
}
async function english() {
  await userEvent.click(screen.getByRole("button", { name: "English" }));
}
function loginResponses(seconds = 900) {
  const token = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.signature`;
  fetchMock
    .mockResolvedValueOnce(
      json({
        message: "ok",
        access_token: token,
        user: {
          id: identity.userId,
          fullName: "Synthetic Parent",
          email: identity.email,
          role: "PARENT",
          status: "ACTIVE",
        },
      }),
    )
    .mockResolvedValueOnce(json(identity));
}

describe("typed Arabic/English presentation", () => {
  it("has complete nonempty resources and a safe fallback without exposing unknown keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
    expect(Object.values(en).every((value) => value.trim().length > 0)).toBe(
      true,
    );
    expect(translator("en")("unknown.untrusted" as MessageKey)).toBe(
      ar["error.unexpected"],
    );
    expect(translator("en")("__proto__" as MessageKey)).toBe(
      ar["error.unexpected"],
    );
    const original = en["home.title"];
    try {
      en["home.title"] = "";
      expect(translator("en")("home.title")).toBe(ar["home.title"]);
    } finally {
      en["home.title"] = original;
    }
  });
  it("defaults to Arabic, supports keyboard switching and updates document metadata without losing fields", async () => {
    mount();
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    fireEvent.change(screen.getByLabelText(ar["auth.email"]), {
      target: { value: identity.email },
    });
    const button = screen.getByRole("button", { name: "English" });
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(document.title).toBe("Sign in | Natiq");
    expect(screen.getByLabelText(en["auth.email"])).toHaveValue(identity.email);
    await userEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.title).toBe("تسجيل الدخول | ناطق");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("translates existing validation errors immediately in both directions", async () => {
    mount("/register");
    fireEvent.click(
      screen.getByRole("button", { name: ar["auth.createParent"] }),
    );
    expect(screen.getByText(ar["validation.nameRequired"])).toBeVisible();
    await english();
    expect(screen.getByText(en["validation.nameRequired"])).toBeVisible();
    expect(screen.getByLabelText(en["auth.email"])).toHaveAccessibleDescription(
      en["validation.emailRequired"],
    );
    expect(screen.getByText(en["validation.passwordRequired"])).toBeVisible();
    fireEvent.change(screen.getByLabelText(en["auth.email"]), {
      target: { value: "invalid" },
    });
    fireEvent.change(screen.getByLabelText(en["auth.password"]), {
      target: { value: "short" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: en["auth.createParent"] }),
    );
    expect(screen.getByText(en["validation.emailInvalid"])).toBeVisible();
    expect(screen.getByText(en["validation.passwordShort"])).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(screen.getByText(ar["validation.emailInvalid"])).toBeVisible();
  });
  it("preserves language across navigation and remount without restoring authentication", async () => {
    const view = mount();
    await english();
    await userEvent.click(
      screen.getByRole("link", { name: en["auth.register"] }),
    );
    expect(
      screen.getByRole("heading", { name: en["auth.registerTitle"] }),
    ).toBeVisible();
    expect(localStorage.getItem(localeStorageKey)).toBe("en");
    view.unmount();
    mount("/home");
    expect(
      screen.getByRole("heading", { name: en["auth.loginTitle"] }),
    ).toBeVisible();
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["invalid", "EN", "fr", "", "null"])(
    "ignores invalid stored locale %s",
    (value) => {
      localStorage.setItem(localeStorageKey, value);
      mount();
      expect(document.documentElement).toHaveAttribute("lang", "ar");
    },
  );
  it("handles storage access and write failures without preventing language changes", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    mount();
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    await english();
    expect(screen.getByLabelText(en["auth.password"])).toBeVisible();
  });
  it.each([
    [400, "error.badRequest"],
    [401, "error.credentials"],
    [403, "error.inactive"],
    [409, "error.conflict"],
    [429, "error.rateLimit"],
    [503, "error.unavailable"],
    [500, "error.request"],
  ] as const)(
    "translates readable HTTP %s without rendering server payloads",
    async (status, key) => {
      fetchMock.mockResolvedValueOnce(
        json({ message: "PRIVATE SERVER DETAILS" }, status),
      );
      mount();
      await english();
      fill();
      fireEvent.click(screen.getByRole("button", { name: en["auth.login"] }));
      expect(await screen.findByText(en[key])).toBeVisible();
      expect(
        screen.queryByText("PRIVATE SERVER DETAILS"),
      ).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "العربية" }));
      expect(screen.getByText(ar[key])).toBeVisible();
    },
  );
  it("localizes duplicate registration, retry-after and every client error category", () => {
    const t = translator("en");
    expect(errorMessage(new ApiError(409), "register", t)).toBe(
      en["error.duplicate"],
    );
    expect(errorMessage(new ApiError(429, "http", 25), "login", t)).toContain(
      "25 seconds",
    );
    expect(errorMessage(new ApiError(429, "http", 1), "login", t)).toContain(
      "1 second.",
    );
    expect(errorMessage(new ApiError(401), "session", t)).toBe(
      en["error.session"],
    );
    for (const kind of ["network", "contract", "config"] as const)
      expect(errorMessage(new ApiError(0, kind), "login", t)).toBe(
        en[`error.${kind}`],
      );
    expect(errorMessage(new Error(), "login", t)).toBe(en["error.unexpected"]);
  });
  it("preserves verified identity, CTA, reduced motion and local logout while switching languages", async () => {
    loginResponses();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    mount();
    await english();
    fill();
    fireEvent.click(screen.getByRole("button", { name: en["auth.login"] }));
    expect(await screen.findByText(identity.email)).toBeVisible();
    expect(screen.getByText(en["role.PARENT"])).toBeVisible();
    expect(screen.queryByText(identity.userId)).not.toBeInTheDocument();
    const scroll = vi.fn();
    Object.defineProperty(
      document.getElementById("coming-soon"),
      "scrollIntoView",
      { value: scroll, configurable: true },
    );
    await userEvent.click(
      screen.getByRole("button", { name: en["home.discover"] }),
    );
    expect(scroll).toHaveBeenCalledWith({
      behavior: "instant",
      block: "start",
    });
    expect(
      screen.getByRole("heading", { name: en["home.futureTitle"] }),
    ).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(screen.getByText(ar["home.signedIn"])).toBeVisible();
    await english();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Object.keys(localStorage)).toEqual([localeStorageKey]);
    expect(sessionStorage.length).toBe(0);
    await userEvent.click(
      screen.getByRole("button", { name: en["home.signOut"] }),
    );
    expect(await screen.findByText(en["session.signedOut"])).toBeVisible();
    expect(screen.queryByText(identity.email)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("translates pending loading and protected retry states without rechecking identity on locale changes", async () => {
    const token = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }))}.signature`;
    let resolveLogin!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveLogin = resolve;
        }),
      )
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json(identity));
    mount();
    await english();
    fill();
    fireEvent.click(screen.getByRole("button", { name: en["auth.login"] }));
    expect(screen.getByText(en["auth.signingIn"])).toBeVisible();
    expect(screen.getByText(en["auth.wait"])).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(screen.getByText(ar["auth.signingIn"])).toBeVisible();
    await english();
    await act(async () => {
      resolveLogin(
        json({
          message: "ok",
          access_token: token,
          user: {
            id: identity.userId,
            fullName: "Synthetic Parent",
            email: identity.email,
            role: "PARENT",
            status: "ACTIVE",
          },
        }),
      );
    });
    expect(
      await screen.findByRole("heading", { name: en["session.unverified"] }),
    ).toBeVisible();
    expect(screen.getByText(en["error.unavailable"])).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(screen.getByText(ar["session.unverified"])).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await english();
    await userEvent.click(
      screen.getByRole("button", { name: en["session.retry"] }),
    );
    expect(await screen.findByText(identity.email)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("translates expiry notices when the locale changes after session expiry", async () => {
    vi.useFakeTimers();
    loginResponses(2);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fill();
    fireEvent.click(screen.getByRole("button", { name: en["auth.login"] }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    vi.useRealTimers();
    await waitFor(() =>
      expect(screen.getByText(en["session.expired"])).toBeVisible(),
    );
    fireEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(screen.getByText(ar["session.expired"])).toBeVisible();
  });
});
