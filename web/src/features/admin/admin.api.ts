import { record } from "../../shared/api";
import {
  applicationSummary,
  type ApplicationSummary,
} from "../account/account.api";

export type AdminDashboard = {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalCount: number;
  recentApplications: ApplicationSummary[];
};
export function dashboardResult(value: unknown): value is AdminDashboard {
  if (!record(value)) return false;
  const counts = [
    value.pendingCount,
    value.approvedCount,
    value.rejectedCount,
    value.totalCount,
  ];
  if (!counts.every((n) => Number.isSafeInteger(n) && (n as number) >= 0))
    return false;
  if (
    (value.pendingCount as number) +
      (value.approvedCount as number) +
      (value.rejectedCount as number) >
    (value.totalCount as number)
  )
    return false;
  return (
    Array.isArray(value.recentApplications) &&
    value.recentApplications.length <= 5 &&
    value.recentApplications.every(
      (a, i, rows) =>
        applicationSummary(a) &&
        a.status !== "DRAFT" &&
        a.submittedAt !== null &&
        Number.isFinite(Date.parse(a.submittedAt)) &&
        (i === 0 ||
          Date.parse(rows[i - 1].submittedAt) >= Date.parse(a.submittedAt)),
    )
  );
}
