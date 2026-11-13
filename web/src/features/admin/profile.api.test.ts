import { describe, expect, it } from "vitest";
import { savedAdminProfile } from "../../../tests/profile.fixture";
import {
  accountDisplayName,
  adminProfileResult,
  validDisplayName,
} from "./profile.api";
describe("Own Admin profile projection and display rules", () => {
  it("validates real saved metadata without inferring mailbox verification", () => {
    expect(adminProfileResult(savedAdminProfile)).toBe(true);
    expect(
      adminProfileResult({
        ...savedAdminProfile,
        connectedProviders: ["GOOGLE", "FACEBOOK"],
        emailVerified: false,
      }),
    ).toBe(true);
  });
  it.each([
    { role: "PARENT" },
    { status: "SUSPENDED" },
    { createdAt: "tomorrow" },
    { updatedAt: null },
    { connectedProviders: ["ADMIN"] },
    { connectedProviders: ["GOOGLE", "GOOGLE"] },
    { passwordEnabled: "true" },
    { emailVerified: undefined },
  ])("rejects malformed projection %j", (change) => {
    expect(adminProfileResult({ ...savedAdminProfile, ...change })).toBe(false);
  });
  it.each(["", "   ", "admin@example.com"])(
    "uses a neutral fallback for unusable name %j",
    (name) => {
      expect(accountDisplayName(name, "Neutral account")).toBe(
        "Neutral account",
      );
    },
  );
  it("preserves actual Arabic and English names", () => {
    expect(accountDisplayName("  اسم تجريبي  ", "Fallback")).toBe("اسم تجريبي");
    expect(validDisplayName("O'Connor Test")).toBe(true);
    expect(validDisplayName("اسم تجريبي")).toBe(true);
  });
  it.each(["", " ", "x".repeat(101), "Hidden\nName", "\u202eName"])(
    "rejects invalid edited name %j",
    (name) => {
      expect(validDisplayName(name)).toBe(false);
    },
  );
});
