import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ApiError } from "../../shared/api";
import { SocialError, type SocialFailure } from "./SocialError";

beforeEach(() => localStorage.setItem("natiqaac.locale", "en"));
function mount(error: unknown, phase: SocialFailure["phase"] = "finish") {
  const signIn = vi.fn();
  render(
    <MemoryRouter>
      <I18nProvider>
        <SocialError failure={{ error, phase }} signIn={signIn} />
      </I18nProvider>
    </MemoryRouter>,
  );
  return signIn;
}
it("offers explicit sign-in and linking only for a classified email conflict", () => {
  const signIn = mount(
    new ApiError(409, undefined, undefined, "OAUTH_EMAIL_CONFLICT"),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "An account already uses this email",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Sign in to connect your account" }),
  );
  expect(signIn).toHaveBeenCalledOnce();
});
it.each([404, 409, 429, 500])(
  "does not mislabel HTTP %s as a linking conflict",
  (status) => {
    mount(new ApiError(status), "context");
    expect(
      screen.queryByRole("button", { name: "Sign in to connect your account" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "An account already uses this email",
    );
  },
);
it("reports an expired proof without a linking action", () => {
  mount(new ApiError(401), "finish");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "expired or is no longer valid",
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("does not turn a registration race or linked identity into an email-linking claim", () => {
  mount(new ApiError(409, "http", undefined, "OAUTH_IDENTITY_CONFLICT"));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "already registered or connected",
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
