import { Link } from "react-router-dom";
import { MaintenanceCountdown } from "../components/MaintenanceCountdown";
import { useMaintenanceStatus } from "../hooks/useMaintenanceStatus";

/** Landing page for anyone force-logged-out or blocked by maintenance mode — see
 * middleware/auth.ts (session block) and api/client.ts (redirect on a 503 maintenance response).
 * Admin sign-in still works from here via the link back to /login. */
export function MaintenancePage() {
  const maintenance = useMaintenanceStatus();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-4 dark:bg-stone-950">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-stone-900 p-8 text-center shadow-lg">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-stone-700/20 blur-3xl" />

        <div className="relative z-10">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl">
              🛠️
            </div>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-white">Under Maintenance</h1>
          <p className="whitespace-pre-line text-sm text-stone-300">
            {maintenance?.message || "We're working on updates to the app — please check back shortly."}
          </p>

          {maintenance?.enabled && (
            <div className="mt-5 rounded-xl bg-black/20 py-4">
              <MaintenanceCountdown until={maintenance.until} />
            </div>
          )}

          {maintenance && !maintenance.enabled && (
            <p className="mt-5 rounded-xl bg-emerald-500/10 py-3 text-sm font-medium text-emerald-300">
              Looks like we're back — try signing in again.
            </p>
          )}

          <Link
            to="/login"
            className="mt-6 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:bg-stone-200"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
