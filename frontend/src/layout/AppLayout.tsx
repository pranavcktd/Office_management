import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { HeaderNotice } from "../components/HeaderNotice";
import { SystemContactFooter } from "../components/SystemContactFooter";
import type { ModuleKey } from "../types";
import { formatDateTime } from "../utils/date";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  module?: ModuleKey;
  adminOnly?: boolean;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    section: "Overview",
    items: [
      { to: "/", label: "Dashboard", end: true },
      { to: "/reports", label: "Reports", adminOnly: true },
    ],
  },
  {
    section: "Applications",
    items: [
      { to: "/pan", label: "PAN Applications", module: "pan" },
      { to: "/tan", label: "TAN Applications", module: "tan" },
    ],
  },
  {
    section: "Operations",
    items: [
      { to: "/dispatch", label: "Inward/Outward", module: "dispatch" },
      { to: "/queries", label: "Client Queries", module: "queries" },
      { to: "/attendance", label: "Attendance", module: "attendance" },
    ],
  },
  {
    section: "People",
    items: [
      { to: "/agents", label: "Agents", module: "agents" },
      { to: "/fee-matrix", label: "Fee Matrix", adminOnly: true },
    ],
  },
  {
    section: "Admin",
    items: [
      { to: "/users", label: "Users", adminOnly: true },
      { to: "/audit", label: "Audit Trail", adminOnly: true },
      { to: "/documents", label: "Documents", adminOnly: true },
      { to: "/settings", label: "Settings", adminOnly: true },
      { to: "/backup", label: "Backup & Restore", adminOnly: true },
    ],
  },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN";
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
              (item) => (!item.adminOnly || isAdmin) && (!item.module || isAdmin || user?.modules?.includes(item.module))
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.section}>
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {section.section}
                </p>
                <div className="space-y-1">
                  {visibleItems.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={() => setNavOpen(false)}>
                      {item.label}
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
            Change Password
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
            <span className="hidden sm:inline">Last login: {formatDateTime(user?.lastLoginAt)}</span>
            <Link to="/profile" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Profile
            </Link>
            <button
              onClick={logout}
              className="rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Sign out
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
