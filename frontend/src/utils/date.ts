/** Converts an ISO date string (e.g. from the API) to DD/MM/YYYY for display/editing. */
export function isoToDdMmYyyy(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Every date elsewhere in the app is DD/MM/YYYY (entered that way, shown that way) — using
// the browser's locale default here would silently switch to M/D/YYYY for US-locale users.
// Unlike isoToDdMmYyyy (for date-only fields, compared in UTC), this reads local getDate/
// getMonth/getFullYear so the date shown always matches the local time shown alongside it.
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}, ${d.toLocaleTimeString()}`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return isoToDdMmYyyy(iso) || "—";
}

/**
 * Formats a Postgres TIME value (returned as an epoch-date ISO string, e.g.
 * "1970-01-01T04:00:00.000Z"). This is a plain time-of-day, not a real moment — its UTC
 * hour/minute already IS the office's local wall-clock time (see attendance.controller.ts's
 * nowAsAttendanceTime/hhmmToTime) — so it's read back via the UTC components directly, the same
 * way it was written, rather than through the browser's own timezone (which would re-apply an
 * offset that was never there to begin with).
 */
export function formatTimeOfDay(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

/** Minutes actually worked across both shifts — mirrors attendance.service.ts's
 * totalWorkedMinutes(). A shift that never closed out (still mid-day, or an early/partial-day
 * departure with no second shift) simply contributes 0 for that half rather than throwing, so a
 * half-finished day still shows whatever was actually completed. */
export function totalWorkedMinutes(record: {
  shift1In?: string | null;
  shift1Out?: string | null;
  shift2In?: string | null;
  shift2Out?: string | null;
}): number {
  const minutesBetween = (start?: string | null, end?: string | null) => {
    if (!start || !end) return 0;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return diff > 0 ? diff / 60000 : 0;
  };
  return minutesBetween(record.shift1In, record.shift1Out) + minutesBetween(record.shift2In, record.shift2Out);
}

/** "7h 30m" — used wherever the office wants actual productive time, not just raw punch times
 * (e.g. to see what a mid-day/partial-day departure actually cost in worked hours). */
export function formatWorkedMinutes(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

/** Today's date as YYYY-MM-DD in the browser's local timezone (for date input defaults/queries). */
export function todayYyyyMmDd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Today's date as DD/MM/YYYY (for defaulting a DateInput-backed field like Form Received Date). */
export function todayDdMmYyyy(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** "Monday, 21/09/2026, 3:45:12 PM" — day name + the same DD/MM/YYYY convention as formatDateTime,
 * for the live clock shown on the login page and beside "last login" in the app shell. */
export function formatDayDateTime(d: Date): string {
  const day = d.toLocaleDateString(undefined, { weekday: "long" });
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}, ${dd}/${mm}/${d.getFullYear()}, ${d.toLocaleTimeString()}`;
}
