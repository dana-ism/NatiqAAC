import { expect, it } from "vitest";
import { dashboardResult } from "./admin.api";
const base = {
  pendingCount: 140,
  approvedCount: 4,
  rejectedCount: 2,
  totalCount: 150,
  recentApplications: [],
};
const application = (date: string) => ({
  id: "synthetic",
  status: "PENDING_REVIEW",
  fullName: "Synthetic",
  email: "synthetic@example.com",
  specialization: "Communication",
  qualification: "Synthetic qualification",
  submittedAt: date,
});
it("accepts global counts independently of the recent list, including draft remainder", () => {
  expect(dashboardResult(base)).toBe(true);
  expect(
    dashboardResult({
      ...base,
      recentApplications: [
        application("2026-11-10"),
        application("2026-11-09"),
      ],
    }),
  ).toBe(true);
});
it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "4", null])(
  "rejects an unreliable count %s",
  (pendingCount) => {
    expect(dashboardResult({ ...base, pendingCount })).toBe(false);
  },
);
it("rejects missing metrics, inconsistent totals and incorrectly labelled recent data", () => {
  expect(dashboardResult({ pendingCount: 1 })).toBe(false);
  expect(dashboardResult({ ...base, totalCount: 1 })).toBe(false);
  expect(
    dashboardResult({
      ...base,
      recentApplications: [
        application("2026-11-09"),
        application("2026-11-10"),
      ],
    }),
  ).toBe(false);
  expect(
    dashboardResult({
      ...base,
      recentApplications: [{ ...application("2026-11-10"), status: "DRAFT" }],
    }),
  ).toBe(false);
  expect(
    dashboardResult({
      ...base,
      recentApplications: [{ ...application("2026-11-10"), submittedAt: null }],
    }),
  ).toBe(false);
  expect(
    dashboardResult({
      ...base,
      recentApplications: Array.from({ length: 6 }, () =>
        application("2026-11-10"),
      ),
    }),
  ).toBe(false);
});
