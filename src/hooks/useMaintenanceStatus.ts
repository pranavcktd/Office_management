import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  until: string | null;
}

/** Unauthenticated endpoint, safe to call before sign-in — lets the login page show the
 * maintenance banner ahead of a blocked login attempt. */
export function useMaintenanceStatus(): MaintenanceStatus | null {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);

  useEffect(() => {
    api
      .get<MaintenanceStatus>("/public/maintenance-status")
      .then(({ data }) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  return status;
}
