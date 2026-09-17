import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  until: string | null;
}

const POLL_INTERVAL_MS = 20_000;

/** Unauthenticated endpoint, safe to call before sign-in — lets the login page show the
 * maintenance banner ahead of a blocked login attempt. Polls rather than fetching once, since a
 * login/maintenance page can be left open in a browser tab for a long time (that's the whole
 * point of the maintenance page) — without polling, an admin disabling maintenance mode would
 * never be reflected there until the visitor manually reloads. */
export function useMaintenanceStatus(): MaintenanceStatus | null {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = () => {
      api
        .get<MaintenanceStatus>("/public/maintenance-status")
        .then(({ data }) => {
          if (!cancelled) setStatus(data);
        })
        .catch(() => {
          if (!cancelled) setStatus(null);
        });
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}
