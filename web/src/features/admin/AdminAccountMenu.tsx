import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../auth/session-context";
import { useI18n } from "../../i18n/context";
import { AdminIcon } from "./AdminIcons";
import { useAdminProfile } from "./profile-context";
import { accountDisplayName } from "./profile.api";

export function AccountAvatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  const { avatarUrl } = useAdminProfile();
  const [failed, setFailed] = useState<string | null>(null);
  const initials = name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("");
  return (
    <span
      className={`account-avatar${large ? " account-avatar-large" : ""}`}
      aria-hidden="true"
    >
      {avatarUrl && avatarUrl !== failed ? (
        <img src={avatarUrl} alt="" onError={() => setFailed(avatarUrl)} />
      ) : (
        initials || <AdminIcon name="users" />
      )}
    </span>
  );
}
export function AdminAccountMenu() {
  const { profile } = useAdminProfile();
  const { t } = useI18n();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const last = useRef(false);
  const name = accountDisplayName(profile.fullName, t("profile.fallback"));
  function close(restore = false) {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const items =
      root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    (last.current ? items?.[items.length - 1] : items?.[0])?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const links = [
    { to: "/admin/profile", label: "profile.myProfile", icon: "users" },
    {
      to: "/admin/account-settings",
      label: "profile.settings",
      icon: "settings",
    },
    {
      to: "/admin/account-settings#security",
      label: "profile.security",
      icon: "shield",
    },
    {
      to: "/admin/account-settings#preferences",
      label: "profile.language",
      icon: "settings",
    },
  ] as const;
  return (
    <div className="admin-account-control" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="admin-account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "admin-account-menu" : undefined}
        onClick={() => {
          last.current = false;
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            last.current = event.key === "ArrowUp";
            setOpen(true);
          }
          if (event.key === "Escape") close(true);
        }}
      >
        <AccountAvatar name={profile.fullName === name ? name : ""} />
        <span className="sr-only">{t("profile.menu")}: </span>
        <bdi className="admin-account-name">{name}</bdi>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="admin-account-menu-panel">
          <div className="admin-account-menu-identity">
            <AccountAvatar name={profile.fullName === name ? name : ""} large />
            <div>
              <strong>
                <bdi>{name}</bdi>
              </strong>
              <bdi className="admin-account-menu-email">{profile.email}</bdi>
              <span className="admin-account-role">{t("role.ADMIN")}</span>
            </div>
          </div>
          <div
            id="admin-account-menu"
            role="menu"
            aria-label={t("profile.menu")}
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  '[role="menuitem"]',
                ),
              );
              const current = items.indexOf(
                document.activeElement as HTMLElement,
              );
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              }
              if (event.key === "Tab") close(true);
              let index: number | undefined;
              if (event.key === "ArrowDown")
                index = (current + 1) % items.length;
              if (event.key === "ArrowUp")
                index = (current - 1 + items.length) % items.length;
              if (event.key === "Home") index = 0;
              if (event.key === "End") index = items.length - 1;
              if (index !== undefined) {
                event.preventDefault();
                items[index]?.focus();
              }
            }}
          >
            {links.map((item) => (
              <Link
                key={item.label}
                role="menuitem"
                tabIndex={-1}
                to={item.to}
                onClick={() => close()}
              >
                <AdminIcon name={item.icon} />
                {t(item.label)}
              </Link>
            ))}
            <button
              role="menuitem"
              tabIndex={-1}
              type="button"
              className="admin-account-logout"
              onClick={() => {
                close();
                session.signOut();
              }}
            >
              <AdminIcon name="logout" />
              {t("profile.logout")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
