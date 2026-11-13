import type { AdminProfile } from "../src/features/admin/profile.api";
export const savedAdminProfile: AdminProfile = {
  fullName: "Synthetic Admin",
  email: "admin@example.com",
  role: "ADMIN",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  emailVerified: false,
  passwordEnabled: true,
  connectedProviders: [],
};
