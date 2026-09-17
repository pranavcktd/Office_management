import { Link } from "react-router-dom";
import { useMaintenanceStatus } from "../hooks/useMaintenanceStatus";
import { formatDateTime } from "../utils/date";

/** Landing page for anyone force-logged-out or blocked by maintenance mode — see
 * middleware/auth.ts (session block) and api/client.ts (redirect on a 503 maintenance response).
 * Admin sign-in still works from here via the link back to /login. */
export function MaintenancePage() {
  const maintenance = useMaintenanceStatus();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 text-4xl">🛠️</div>
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Under Maintenance</h1>
        <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
          {maintenance?.message || "We're working on updates to the app — please check back shortly."}
        </p>
        {maintenance?.until && (
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
            Expected back: {formatDateTime(maintenance.until)}
          </p>
        )}
        {maintenance && !maintenance.enabled && (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Looks like we're back — try signing in again.
          </p>
        )}
        <Link
          to="/login"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}
