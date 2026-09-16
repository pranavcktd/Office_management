import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/settings/categories", label: "Category Lists" },
  { to: "/settings/field-requirements", label: "Field Requirements" },
  { to: "/settings/protean-mapping", label: "Protean Report Columns" },
  { to: "/settings/tracking-links", label: "Tracking Links" },
  { to: "/settings/email", label: "Email & Day-End Report" },
  { to: "/settings/site-content", label: "Site Content" },
];

export function SettingsLayout() {
  return (
    <div className="px-6 py-8">
      <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
      <div className="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
