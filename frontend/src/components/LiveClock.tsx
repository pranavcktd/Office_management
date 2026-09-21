import { useEffect, useState } from "react";
import { formatDayDateTime } from "../utils/date";

/** Ticks once a second so the current day/date/time is always live — used on the login page and
 * beside "last login" in the authenticated app shells. */
export function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return <span className={className}>{formatDayDateTime(now)}</span>;
}
