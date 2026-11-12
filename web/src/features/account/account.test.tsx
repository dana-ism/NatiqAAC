import { StrictMode, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ApiError } from "../../shared/api";
import {
  accountApi,
  applicationDetails,
  registrationResult,
} from "./account.api";
import {
  AccountTypePage,
  AdminApplicationsPage,
  ApplicationStatusPage,
  ParentRegistrationPage,
  VerificationPendingPage,
  VerificationResultPage,
} from "./AccountPages";

const session = vi.hoisted(() => ({
  status: "anonymous",
  authenticatedGet: vi.fn(),
  authenticatedPost: vi.fn(),
  uploadDocument: vi.fn(),
  downloadDocument: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../auth/session-context", () => ({ useSession: () => session }));
function mount(component: ReactNode, strict = false) {
  const tree = (
    <MemoryRouter>
      <I18nProvider>{component}</I18nProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  session.status = "anonymous";
  window.localStorage.setItem("natiqaac.locale", "en");
  window.history.replaceState(null, "", "/verify-email");
});

describe("account screens", () => {
  it("rejects a password mismatch, focuses confirmation and preserves typed input", () => {
    const register = vi.spyOn(accountApi, "register");
    mount(<ParentRegistrationPage />);
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Synthetic" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "synthetic@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Synthetic123!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "Different123!" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create account and continue" })
        .closest("form")!,
    );
    expect(screen.getByLabelText("Confirm password")).toHaveFocus();
    expect(
      screen.getByLabelText("Confirm password"),
    ).toHaveAccessibleDescription(/do not match/);
    expect(screen.getByLabelText("Password")).toHaveValue("Synthetic123!");
    expect(register).not.toHaveBeenCalled();
  });
  it("checks the backend without marking an unverified account verified or issuing a session", async () => {
    session.status = "onboarding";
    session.authenticatedGet.mockResolvedValue({
      userId: "synthetic",
      email: "synthetic@example.com",
      role: "PARENT",
      emailVerified: false,
      legacyAuthExempt: false,
    });
    mount(<VerificationPendingPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "I've verified my email" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "not been verified yet",
    );
    expect(session.authenticatedGet).toHaveBeenCalledWith(
      "/auth/onboarding/me",
      expect.any(Function),
    );
    expect(session.authenticatedPost).not.toHaveBeenCalled();
  });
  it("honors Retry-After and never claims successful resend after a rate-limit failure", async () => {
    vi.spyOn(accountApi, "resend").mockRejectedValue(
      new ApiError(429, "http", 120),
    );
    mount(<VerificationPendingPage />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "synthetic@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Resend verification email" }),
    ).toBeDisabled();
    expect(
      screen.getByText("You can request another link in 120 seconds."),
    ).toBeVisible();
    expect(
      screen.queryByText(/If this account is eligible/),
    ).not.toBeInTheDocument();
  });
  it("offers separate parent and specialist entry routes", () => {
    mount(<AccountTypePage />);
    expect(
      screen.getByRole("link", { name: "Parent account" }),
    ).toHaveAttribute("href", "/register/parent");
    expect(
      screen.getByRole("link", { name: "Specialist application" }),
    ).toHaveAttribute("href", "/register/specialist");
  });
  it("removes the verification fragment without consuming it before explicit confirmation, including StrictMode", async () => {
    window.history.replaceState(
      null,
      "",
      "/verify-email#token=synthetic-secret",
    );
    const verify = vi
      .spyOn(accountApi, "verify")
      .mockResolvedValue({ message: "ok" });
    mount(<VerificationResultPage />, true);
    expect(window.location.hash).toBe("");
    expect(verify).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm email verification" }),
    );
    await waitFor(() =>
      expect(verify).toHaveBeenCalledExactlyOnceWith("synthetic-secret"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Email verified",
    );
  });
  it("does not send verification requests when the token is missing", () => {
    const verify = vi.spyOn(accountApi, "verify");
    mount(<VerificationResultPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm email verification" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("missing or invalid");
    expect(verify).not.toHaveBeenCalled();
  });
  it("preserves truthful generic resend feedback and does not claim delivery", async () => {
    const resend = vi
      .spyOn(accountApi, "resend")
      .mockResolvedValue({ message: "ok" });
    mount(<VerificationPendingPage />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "Synthetic@Example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );
    await waitFor(() =>
      expect(resend).toHaveBeenCalledWith("synthetic@example.com", "en"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If this account is eligible",
    );
  });
  it("focuses an invalid field and sends no registration request", () => {
    const register = vi.spyOn(accountApi, "register");
    mount(<ParentRegistrationPage />);
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create account and continue" })
        .closest("form")!,
    );
    expect(screen.getByLabelText("Full name")).toHaveFocus();
    expect(register).not.toHaveBeenCalled();
  });
  it("sends only parent registration fields and preserves password characters", async () => {
    const register = vi
      .spyOn(accountApi, "register")
      .mockRejectedValue(new Error("synthetic network failure"));
    mount(<ParentRegistrationPage />);
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: " Synthetic Parent " },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "Synthetic@Example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: " Password123! " },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: " Password123! " },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create account and continue" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        "parent",
        {
          fullName: "Synthetic Parent",
          email: "synthetic@example.com",
          password: " Password123! ",
          locale: "en",
        },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
  it("keeps professional submission disabled until both email verification and document upload", async () => {
    session.authenticatedGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("onboarding")
          ? {
              userId: "id",
              email: "synthetic@example.com",
              role: "SPECIALIST",
              emailVerified: false,
              legacyAuthExempt: false,
            }
          : {
              id: "id",
              status: "DRAFT",
              specialization: "Communication",
              qualification: "Degree",
              summary: null,
              hasDocument: false,
              reviews: [],
            },
      ),
    );
    mount(<ApplicationStatusPage />);
    expect(
      await screen.findByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Supporting qualification document"),
    ).toHaveAttribute("accept", "application/pdf");
    expect(session.authenticatedPost).not.toHaveBeenCalled();
  });
  it("does not label a legacy login exemption as verified email and offers mailbox verification", async () => {
    session.authenticatedGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("onboarding")
          ? {
              userId: "id",
              email: "synthetic@example.com",
              role: "SPECIALIST",
              emailVerified: false,
              legacyAuthExempt: true,
            }
          : {
              id: "id",
              status: "DRAFT",
              specialization: "Synthetic",
              qualification: "Synthetic",
              summary: null,
              hasDocument: false,
              reviews: [],
            },
      ),
    );
    mount(<ApplicationStatusPage />);
    expect(
      await screen.findByRole("link", { name: "Resend verification email" }),
    ).toHaveAttribute("href", "/verification-pending");
    expect(
      screen.queryByText("Email verified", { exact: true }),
    ).not.toBeInTheDocument();
  });
  it("requires a second explicit action before admin approval", async () => {
    const application = {
      id: "synthetic-id",
      status: "PENDING_REVIEW",
      fullName: "Synthetic Specialist",
      email: "synthetic@example.com",
      specialization: "Communication",
      qualification: "Degree",
      submittedAt: "2026-11-09T00:00:00Z",
      summary: null,
      hasDocument: true,
      reviews: [],
    };
    session.authenticatedGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("synthetic-id")
          ? { application }
          : { applications: [application] },
      ),
    );
    session.authenticatedPost.mockResolvedValue({ message: "ok" });
    mount(<AdminApplicationsPage />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "View application: Synthetic Specialist",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve application" }),
    );
    expect(session.authenticatedPost).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "Confirm approval and grant specialist access?",
      }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Confirm decision" }));
    await waitFor(() =>
      expect(session.authenticatedPost).toHaveBeenCalledWith(
        "/admin/specialist-applications/synthetic-id/approve",
        {},
        expect.any(Function),
      ),
    );
  });
});

describe("account response validation", () => {
  it("rejects registration responses that lack actual delivery status", () => {
    expect(registrationResult({ message: "ok", user: { id: "id" } })).toBe(
      false,
    );
  });
  it("rejects invalid application states and review structures", () => {
    const base = {
      id: "id",
      status: "DRAFT",
      specialization: "x",
      qualification: "y",
      summary: null,
      hasDocument: false,
      reviews: [],
    };
    expect(applicationDetails(base)).toBe(true);
    expect(applicationDetails({ ...base, status: "FAKE" })).toBe(false);
    expect(applicationDetails({ ...base, reviews: [{ reason: 3 }] })).toBe(
      false,
    );
  });
});
