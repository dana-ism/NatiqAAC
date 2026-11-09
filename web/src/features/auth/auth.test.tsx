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
import { App } from "../../app/App";
import { SessionProvider } from "./SessionProvider";
import { ApiError, errorMessage, retrySeconds } from "../../shared/api";
import { validate } from "./validation";
import { authApi } from "./api";
import { ar } from "../../i18n/ar";

const identity = {
  userId: "6fbbe1de-542e-409e-bbec-088c6c084416",
  email: "parent@example.com",
  role: "PARENT",
};
const user = {
  id: identity.userId,
  fullName: "Synthetic Parent",
  email: identity.email,
  role: "PARENT",
  status: "ACTIVE",
};
function token(seconds = 900) {
  return `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.signature`;
}
function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
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
async function fill(register = false) {
  const input = userEvent.setup();
  if (register)
    await input.type(screen.getByLabelText("الاسم الكامل"), "Synthetic Parent");
  await input.type(
    screen.getByLabelText("البريد الإلكتروني"),
    "parent@example.com",
  );
  await input.type(screen.getByLabelText("كلمة المرور"), "TestPass123!");
  return input;
}
async function login() {
  fetchMock
    .mockResolvedValueOnce(
      json({ message: "Login successful", access_token: token(), user }),
    )
    .mockResolvedValueOnce(json(identity));
  const input = await fill();
  await input.click(screen.getByRole("button", { name: /^تسجيل الدخول/ }));
  await screen.findByText(identity.email);
  return input;
}

describe("Forms and memory-only authentication with controlled HTTP responses", () => {
  it("renders labeled Arabic login fields and password visibility with keyboard interaction", async () => {
    mount();
    const input = userEvent.setup();
    const password = screen.getByLabelText("كلمة المرور");
    expect(password).toHaveAttribute("type", "password");
    screen.getByRole("button", { name: "إظهار كلمة المرور" }).focus();
    await input.keyboard("{Enter}");
    expect(password).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "إخفاء كلمة المرور" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("rejects empty fields, links accessible errors, and focuses the first invalid input", async () => {
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: /^تسجيل الدخول/ }),
    );
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveFocus();
    expect(
      screen.getByLabelText("البريد الإلكتروني"),
    ).toHaveAccessibleDescription("أدخل البريد الإلكتروني.");
    expect(screen.getByLabelText("كلمة المرور")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("validates malformed email and short password without contacting the API", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), {
      target: { value: "invalid" },
    });
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "short" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /^تسجيل الدخول/ }).closest("form")!,
    );
    expect(
      await screen.findByText("أدخل بريدًا إلكترونيًا صالحًا."),
    ).toBeVisible();
    expect(screen.getByText("استخدم 8 أحرف على الأقل.")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("logs in, validates /auth/me with a Bearer header, and clears the session locally", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    mount();
    const input = await login();
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/auth/login");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: identity.email,
      password: "TestPass123!",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:3000/auth/me");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toMatch(
      /^Bearer /,
    );
    expect(storage).not.toHaveBeenCalled();
    await input.click(screen.getByRole("button", { name: /^تسجيل الخروج/ }));
    expect(
      await screen.findByRole("heading", { name: "سعيدون بوجودك هنا." }),
    ).toBeVisible();
    expect(screen.queryByText(identity.email)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not restore a session when the application remounts", async () => {
    const first = mount();
    await login();
    first.unmount();
    mount("/home");
    expect(
      await screen.findByRole("heading", { name: "سعيدون بوجودك هنا." }),
    ).toBeVisible();
    expect(screen.queryByText(identity.email)).not.toBeInTheDocument();
  });
  it("registers only accepted fields, then requires email verification", async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          message: "Account registered successfully",
          user: { ...user, createdAt: new Date().toISOString() },
          verification: { emailSent: true },
        },
        201,
      ),
    );
    mount("/register/parent");
    const input = await fill(true);
    await input.click(
      screen.getByRole("button", { name: ar["account.apply"] }),
    );
    expect(
      await screen.findByRole("heading", { name: ar["account.pending"] }),
    ).toBeVisible();
    expect(
      Object.keys(JSON.parse(fetchMock.mock.calls[0][1].body)).sort(),
    ).toEqual(["email", "fullName", "locale", "password"]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:3000/auth/register/parent",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).locale).toBe("ar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403, 429, 503, 500])(
    "renders a safe accessible login error for HTTP %s",
    async (status) => {
      fetchMock.mockResolvedValue(
        json({ message: "PRIVATE_BACKEND_DETAILS" }, status),
      );
      mount();
      const input = await fill();
      await input.click(screen.getByRole("button", { name: /^تسجيل الدخول/ }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        errorMessage(new ApiError(status), "login"),
      );
      expect(
        screen.queryByText("PRIVATE_BACKEND_DETAILS"),
      ).not.toBeInTheDocument();
    },
  );
  it("renders duplicate registration feedback", async () => {
    fetchMock.mockResolvedValue(json({}, 409));
    mount("/register/parent");
    const input = await fill(true);
    await input.click(
      screen.getByRole("button", { name: ar["account.apply"] }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "هذا البريد مسجّل بالفعل",
    );
  });
  it("uses server-supplied retry information without inventing a duration", async () => {
    fetchMock.mockResolvedValue(json({ retryAfterSeconds: 30 }, 429));
    mount();
    const input = await fill();
    await input.click(screen.getByRole("button", { name: /^تسجيل الدخول/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("30 ثانية");
  });
  it("distinguishes a network failure from incorrect credentials", async () => {
    fetchMock.mockRejectedValue(new TypeError("Synthetic network error"));
    mount();
    const input = await fill();
    await input.click(screen.getByRole("button", { name: /^تسجيل الدخول/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تعذّر الاتصال بالخدمة",
    );
  });
  it("disables duplicate submissions while waiting for the login response", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    mount();
    const input = await fill();
    await input.click(screen.getByRole("button", { name: /^تسجيل الدخول/ }));
    expect(
      screen.getByRole("button", { name: /جارٍ تسجيل الدخول/ }),
    ).toBeDisabled();
    expect(screen.getByLabelText("البريد الإلكتروني")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("never shows protected identity until /auth/me finishes", async () => {
    let resolve!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(
        json({ message: "Login successful", access_token: token(), user }),
      )
      .mockReturnValueOnce(
        new Promise<Response>((r) => {
          resolve = r;
        }),
      );
    mount();
    const input = await fill();
    await input.click(screen.getByRole("button", { name: /^تسجيل الدخول/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(identity.email)).not.toBeInTheDocument();
    await act(async () => resolve(json(identity)));
    expect(await screen.findByText(identity.email)).toBeVisible();
  });
  it("rejects an unauthenticated protected route without making API calls", async () => {
    mount("/home");
    expect(
      await screen.findByRole("heading", { name: "سعيدون بوجودك هنا." }),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects an invalid session returned by /auth/me", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ message: "Login successful", access_token: token(), user }),
      )
      .mockResolvedValueOnce(json({}, 401));
    mount();
    const input = await fill();
    await input.click(screen.getByRole("button", { name: /^تسجيل الدخول/ }));
    expect(
      await screen.findByText(
        "انتهت الجلسة أو لم تعد صالحة. سجّل الدخول مجددًا.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(identity.email)).not.toBeInTheDocument();
  });
  it("keeps a transient /auth/me failure separate and supports retry", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ message: "Login successful", access_token: token(), user }),
      )
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json(identity));
    mount();
    const input = await fill();
    await input.click(screen.getByRole("button", { name: /^تسجيل الدخول/ }));
    expect(
      await screen.findByRole("heading", { name: "تعذّر التحقق من الجلسة." }),
    ).toBeVisible();
    expect(screen.queryByText(identity.email)).not.toBeInTheDocument();
    await input.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText(identity.email)).toBeVisible();
  });
  it("clears an expired token when the browser tab becomes visible", async () => {
    mount();
    await login();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 901000);
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(
      await screen.findByRole("heading", { name: "سعيدون بوجودك هنا." }),
    ).toBeVisible();
    expect(screen.queryByText(identity.email)).not.toBeInTheDocument();
  });
  it("expires an idle session on its scheduled deadline", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        json({ message: "Login successful", access_token: token(10), user }),
      )
      .mockResolvedValueOnce(json(identity));
    mount();
    fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), {
      target: { value: identity.email },
    });
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "TestPass123!" },
    });
    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: /^تسجيل الدخول/ }).closest("form")!,
      );
    });
    expect(screen.getByText(identity.email)).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.queryByText(identity.email)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "سعيدون بوجودك هنا." }),
    ).toBeVisible();
  });
});

describe("Authenticated welcome presentation", () => {
  it("shows accurate minimal identity, a single honest status and clearly unfinished content", async () => {
    mount();
    await login();
    expect(screen.getByText(identity.email)).toBeVisible();
    expect(screen.getByText("ولي أمر")).toBeVisible();
    expect(screen.queryByText(identity.userId)).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "نتواصل بطرق مختلفة ونلتقي في الفهم",
    );
    expect(
      screen.getAllByText("تم تسجيل الدخول", { exact: true }),
    ).toHaveLength(1);
    for (const removed of [
      "تم التحقق من الحساب",
      "تم تسجيل دخولك بنجاح",
      "لكل تعبير مساحة",
      "لأن لكل تعبير قيمة",
      "خطوة أقرب إلى التعبير",
      "معرّف الحساب",
    ]) {
      expect(
        screen.queryByText(removed, { exact: false }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.getByRole("region", { name: "تجارب جديدة في الطريق" }),
    ).toHaveTextContent("قريبًا");
    expect(
      screen.getByRole("region", { name: "تجارب جديدة في الطريق" }),
    ).toHaveTextContent(
      "نعمل الآن على تجهيز تجارب التواصل والتعلّم، وستظهر هنا قريبًا.",
    );
    expect(
      screen
        .getByRole("region", { name: "تجارب جديدة في الطريق" })
        .querySelector("a,button"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "تسجيل الخروج" }),
    ).toHaveAccessibleDescription("سيتم إنهاء جلستك على هذا الجهاز فقط.");
  });
  it.each([false, true])(
    "discovers the real preview section and respects reduced motion=%s",
    async (reduced) => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockReturnValue({ matches: reduced }),
      );
      mount();
      const input = await login();
      const scroll = vi.fn();
      Object.defineProperty(
        document.getElementById("coming-soon"),
        "scrollIntoView",
        { value: scroll, configurable: true },
      );
      await input.click(
        screen.getByRole("button", { name: "اكتشف ما ينتظرك" }),
      );
      expect(scroll).toHaveBeenCalledWith({
        behavior: reduced ? "instant" : "smooth",
        block: "start",
      });
      expect(
        screen.getByRole("heading", { name: "تجارب جديدة في الطريق" }),
      ).toHaveFocus();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
});

describe("API boundaries and validation", () => {
  it("enforces password UTF-8 length and preserves valid whitespace", () => {
    expect(
      validate(
        { fullName: "Parent", email: identity.email, password: "ع".repeat(37) },
        true,
      ).password,
    ).toBeTruthy();
    expect(
      validate(
        {
          fullName: "Parent",
          email: identity.email,
          password: " TestPass123! ",
        },
        true,
      ),
    ).toEqual({});
    expect(
      validate(
        { fullName: "   ", email: identity.email, password: "TestPass123!" },
        true,
      ).fullName,
    ).toBeTruthy();
  });
  it("rejects malformed successful responses and unexpected HTTP success codes", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "incomplete" }))
      .mockResolvedValueOnce(json(identity, 201));
    await expect(
      authApi.login({ email: identity.email, password: "TestPass123!" }),
    ).rejects.toMatchObject({ kind: "contract" });
    await expect(authApi.me(token())).rejects.toMatchObject({
      kind: "contract",
    });
  });
  it("requires a public URL without credentials and rejects remote cleartext HTTP", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://user:password@example.com");
    await expect(authApi.me(token())).rejects.toMatchObject({ kind: "config" });
    vi.stubEnv("VITE_API_BASE_URL", "http://example.com");
    await expect(authApi.me(token())).rejects.toMatchObject({ kind: "config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reads Retry-After seconds or dates and does not invent missing data", () => {
    expect(retrySeconds("15", { retryAfterSeconds: 30 })).toBe(15);
    expect(retrySeconds(null, {})).toBeUndefined();
    const date = new Date(
      Math.ceil(Date.now() / 1000) * 1000 + 30000,
    ).toUTCString();
    expect(retrySeconds(date, {})).toBeGreaterThanOrEqual(30);
  });
});
