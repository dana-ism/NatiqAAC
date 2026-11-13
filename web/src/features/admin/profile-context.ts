import { createContext, useContext } from "react";
import type { AdminProfile } from "./profile.api";
export type ProfileContext = {
  profile: AdminProfile;
  updateProfile: (profile: AdminProfile) => void;
  reload: () => void;
};
export const AdminProfileContext = createContext<ProfileContext | null>(null);
export function useAdminProfile() {
  const context = useContext(AdminProfileContext);
  if (!context) throw Error("Admin profile context is required");
  return context;
}
