import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { HeaderNotice } from "../components/HeaderNotice";
import { LanguageToggle } from "../components/LanguageToggle";
import { SystemContactFooter } from "../components/SystemContactFooter";
import { ThemeToggle } from "../components/ThemeToggle";
import { useLanguage } from "../hooks/useLanguage";
import type { TranslationKey } from "../i18n/translations";
import type { ModuleKey } from "../types";
import { formatDateTime } from "../utils/date";

interface NavItem {
  to: string;
  labelKey: TranslationKey;
  end?: boolean;
  module?: ModuleKey;
  adminOnly?: boolean;
  /** Also visible to an AUDITOR even though adminOnly is set — for the handful of admin-nav
   * items that are genuinely read-only views (Reports, Audit Trail, Fee Matrix, Users). */
  auditorOk?: boolean;
}

interface NavSection {
  sectionKey: TranslationKey;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    sectionKey: "nav_overview",
    items: [
      { to: "/", labelKey: "nav_dashboard", end: true },
      { to: "/reports", labelKey: "nav_reports", adminOnly: true, auditorOk: true },
    ],
  },
  {
    sectionKey: "nav_applications",
    items: [
      { to: "/pan", labelKey: "nav_pan", module: "pan" },
      { to: "/tan", labelKey: "nav_tan", module: "tan" },
    ],
  },
  {
    sectionKey: "nav_operations",
    items: [
      { to: "/dispatch", labelKey: "nav_dispatch", module: "dispatch" },
      { to: "/queries", labelKey: "nav_queries", module: "queries" },
      // No module gate — every staff member always has access to their own attendance.
      { to: "/attendance", labelKey: "nav_attendance" },
    ],
  },
  {
    sectionKey: "nav_people",
    items: [
      { to: "/agents", labelKey: "nav_agents", module: "agents" },
      { to: "/fee-matrix", labelKey: "nav_fee_matrix", adminOnly: true, auditorOk: true },
      // No module gate — every staff member always has access to their own ledger.
      { to: "/staff-ledger", labelKey: "nav_staff_ledger" },
    ],
  },
  {
    sectionKey: "nav_admin",
    items: [
      { to: "/users", labelKey: "nav_users", adminOnly: true, auditorOk: true },
      { to: "/audit", labelKey: "nav_audit", adminOnly: true, auditorOk: true },
      { to: "/documents", labelKey: "nav_documents", adminOnly: true },
      { to: "/settings", labelKey: "nav_settings", adminOnly: true },
      { to: "/backup", labelKey: "nav_backup", adminOnly: true },
    ],
  },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const isAdmin = user?.role === "ADMIN";
  const isAuditor = user?.role === "AUDITOR";
  const [navOpen, setNavOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Backdrop, mobile only, shown while the drawer is open */}
      {navOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setNavOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-60 shrink-0 -translate-x-full transform flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:static md:translate-x-0 dark:border-slate-800 dark:bg-slate-900 ${
          navOpen ? "translate-x-0" : ""
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Office Management
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {user?.fullName ?? user?.agentName} · {user?.role}
            </p>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {navSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) =>
                (!item.adminOnly || isAdmin || (item.auditorOk && isAuditor)) &&
                (!item.module || isAdmin || isAuditor || user?.modules?.includes(item.module))
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.sectionKey}>
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {t(section.sectionKey)}
                </p>
                <div className="space-y-1">
                  {visibleItems.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={() => setNavOpen(false)}>
                      {t(item.labelKey)}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="shrink-0 space-y-1 border-t border-slate-200 p-3 dark:border-slate-800">
          <Link
            to="/change-password"
            onClick={() => setNavOpen(false)}
            className="block rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("change_password")}
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ☰
            </button>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 md:hidden">Office Management</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="hidden sm:inline">{t("last_login")}: {formatDateTime(user?.lastLoginAt)}</span>
            <LanguageToggle />
            <ThemeToggle />
            <Link to="/profile" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              {t("profile")}
            </Link>
            <button
              onClick={logout}
              className="rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t("sign_out")}
            </button>
          </div>
        </div>
        <HeaderNotice />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <SystemContactFooter />
      </div>
    </div>
  );
}
