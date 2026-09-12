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
 * "1970-01-01T04:00:00.000Z") as a local wall-clock time. This round-trips correctly for a
 * punch recorded and viewed in the same timezone (this is a single-office tool), since the
 * stored UTC time-of-day is exactly the punch moment's UTC time-of-day.
 */
export function formatTimeOfDay(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
