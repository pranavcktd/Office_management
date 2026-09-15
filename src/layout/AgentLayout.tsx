import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AgentNotificationBell } from "../components/AgentNotificationBell";
import { HeaderNotice } from "../components/HeaderNotice";
import { LanguageToggle } from "../components/LanguageToggle";
import { SystemContactFooter } from "../components/SystemContactFooter";
import { ThemeToggle } from "../components/ThemeToggle";
import { useLanguage } from "../hooks/useLanguage";
import type { TranslationKey } from "../i18n/translations";
import { formatDateTime } from "../utils/date";

const navItems: Array<{ to: string; labelKey: TranslationKey; end?: boolean }> = [
  { to: "/portal", labelKey: "nav_dashboard", end: true },
  { to: "/portal/applications", labelKey: "nav_my_applications" },
  { to: "/portal/queries", labelKey: "nav_my_queries" },
  { to: "/portal/documents", labelKey: "nav_documents" },
];

export function AgentLayout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
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
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent Portal</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{user?.agentName}</p>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`
              }
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
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
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 md:hidden">Agent Portal</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="hidden sm:inline">{t("last_login")}: {formatDateTime(user?.lastLoginAt)}</span>
            <AgentNotificationBell />
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
