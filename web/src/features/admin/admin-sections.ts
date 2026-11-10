/** One route catalogue for the sidebar, page context and approved future pages. */
export const adminSections = [
  {
    path: "/admin",
    title: "admin.overview",
    icon: "overview",
    comingSoon: false,
  },
  {
    path: "/admin/specialist-applications",
    title: "account.applications",
    icon: "applications",
    comingSoon: false,
  },
  {
    path: "/admin/users",
    title: "adminV2.users",
    description: "adminV2.usersHelp",
    icon: "users",
    comingSoon: true,
  },
  {
    path: "/admin/content",
    title: "adminV2.content",
    description: "adminV2.contentHelp",
    icon: "content",
    comingSoon: true,
  },
  {
    path: "/admin/admins",
    title: "adminV2.admins",
    description: "adminV2.adminsHelp",
    icon: "shield",
    comingSoon: true,
  },
  {
    path: "/admin/settings",
    title: "adminV2.settings",
    description: "adminV2.settingsHelp",
    icon: "settings",
    comingSoon: true,
  },
  {
    path: "/admin/audit-logs",
    title: "adminV2.audit",
    description: "adminV2.auditHelp",
    icon: "history",
    comingSoon: true,
  },
] as const;
export type FutureAdminSection = Extract<
  (typeof adminSections)[number],
  { comingSoon: true }
>;
export const futureAdminSections = adminSections.filter(
  (section): section is FutureAdminSection => section.comingSoon,
);
