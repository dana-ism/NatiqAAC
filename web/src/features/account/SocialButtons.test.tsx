import { webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { SocialButtons } from "./SocialButtons";

const session = vi.hoisted(() => ({
  adoptSession: vi.fn(),
  authenticatedPost: vi.fn(),
}));
vi.mock("../auth/session-context", () => ({ useSession: () => session }));
let popup: {
  closed: boolean;
  close: ReturnType<typeof vi.fn>;
  location: { href: string };
};
let fetchMock: ReturnType<typeof vi.fn>;
function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function mount(
  props: Parameters<typeof SocialButtons>[0] = { intent: "login" },
) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <SocialButtons {...props} />
      </I18nProvider>
    </MemoryRouter>,
  );
}
async function start(provider = "Google") {
  fireEvent.click(
    screen.getByRole("button", { name: `Continue with ${provider}` }),
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(popup.location.href).toMatch(/^https:/));
}
function callback(
  origin = "http://localhost:3000",
  source: unknown = popup,
  payload: unknown = {
    type: "natiqaac-oauth",
    completionId: "synthetic-completion-123456",
  },
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      source: source as Window,
      data: payload,
    }),
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:3000");
  localStorage.setItem("natiqaac.locale", "en");
  popup = { closed: false, close: vi.fn(), location: { href: "about:blank" } };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  fetchMock = vi.fn().mockResolvedValue(
    json({
      authorizationUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  session.adoptSession.mockResolvedValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OAuth popup flow", () => {
  it("starts identity linking through the authenticated account endpoint", async () => {
    session.authenticatedPost.mockResolvedValue({
      authorizationUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic",
    });
    mount({ intent: "link" });
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    await waitFor(() =>
      expect(session.authenticatedPost).toHaveBeenCalledWith(
        "/auth/oauth/link/start",
        {
          provider: "GOOGLE",
          challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        },
        expect.any(Function),
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("collects missing Google registration details before consuming completion", async () => {
    mount({ intent: "register", role: "PARENT" });
    await start();
    act(() => callback());
    expect(await screen.findByLabelText("Full name")).toBeRequired();
    expect(screen.getByLabelText("Email address")).toBeRequired();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reports blocked popups before making any network requests", () => {
    vi.mocked(window.open).mockReturnValue(null);
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Allow pop-ups");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("opens synchronously and sends a SHA256 challenge without its secret verifier", async () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(window.open).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      provider: "GOOGLE",
      intent: "login",
      challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
  });
  it("ignores forged origin, wrong popup source and malformed callback payloads", async () => {
    mount();
    await start();
    act(() => {
      callback("https://attacker.example");
      callback("http://localhost:3000", window);
      callback("http://localhost:3000", popup, {
        type: "natiqaac-oauth",
        completionId: "synthetic-completion-123456",
        access_token: "forged",
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.adoptSession).not.toHaveBeenCalled();
  });
  it("exchanges only a validated completion and verifier, then delegates session verification", async () => {
    const result = {
      message: "ok",
      access_token: "synthetic-token",
      user: {
        id: "id",
        fullName: "Synthetic Parent",
        email: "synthetic@example.com",
        role: "PARENT",
        status: "ACTIVE",
      },
    };
    fetchMock
      .mockResolvedValueOnce(
        json({
          authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        }),
      )
      .mockResolvedValueOnce(json(result));
    mount();
    await start();
    act(() => callback());
    await waitFor(() =>
      expect(session.adoptSession).toHaveBeenCalledWith(result),
    );
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(Object.keys(body).sort()).toEqual(["completionId", "verifier"]);
    expect(body.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const challenge = Buffer.from(
      await webcrypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(body.verifier),
      ),
    ).toString("base64url");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).challenge).toBe(
      challenge,
    );
    expect(localStorage.getItem("synthetic-token")).toBeNull();
  });
  it("shows controlled missing-info completion and whitelists registration fields", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          authorizationUrl: "https://www.facebook.com/v24.0/dialog/oauth",
        }),
      )
      .mockResolvedValueOnce(
        json({
          message: "ok",
          onboarding_token: "synthetic-token",
          user: {
            id: "id",
            fullName: "Synthetic",
            email: "synthetic@example.com",
            role: "SPECIALIST",
            status: "PENDING",
          },
        }),
      );
    const registration = {
      fullName: "",
      email: "",
      password: "NEVER_SEND",
      role: "ADMIN",
    };
    mount({ intent: "register", role: "SPECIALIST", registration });
    await start("Facebook");
    act(() => callback());
    expect(
      await screen.findByRole("heading", {
        name: "Complete your account information",
      }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Synthetic" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "Synthetic@Example.com" },
    });
    fireEvent.change(screen.getByLabelText("Professional specialization"), {
      target: { value: "Communication" },
    });
    fireEvent.change(screen.getByLabelText("Academic qualification"), {
      target: { value: "Degree" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toEqual({
      completionId: "synthetic-completion-123456",
      verifier: expect.any(String),
      fullName: "Synthetic",
      email: "synthetic@example.com",
      specialization: "Communication",
      qualification: "Degree",
      locale: "en",
    });
    expect(JSON.stringify(body)).not.toContain("NEVER_SEND");
    expect(body.role).toBeUndefined();
  });
  it("handles user cancellation and removes popup listeners", async () => {
    mount();
    await start();
    popup.closed = true;
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "canceled or expired",
      ),
    );
    act(() => callback());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("cleans up and closes an unfinished popup on unmount", async () => {
    const view = mount();
    await start();
    view.unmount();
    expect(popup.close).toHaveBeenCalled();
    act(() => callback());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("refuses an authorization URL that points outside the chosen provider", async () => {
    fetchMock.mockResolvedValue(
      json({ authorizationUrl: "https://attacker.example/login" }),
    );
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Provider authentication failed",
      ),
    );
    expect(popup.location.href).toBe("about:blank");
  });
});
