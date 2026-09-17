// Turns a YYYY-MM-DD boundary (from a native <input type="date">) into the server's local
// calendar-day bounds — the same interpretation Day-End Report's dayBounds() already uses —
// rather than UTC midnight. createdAt carries a real time-of-day, so a naive UTC boundary would
// shift "today" by the office's UTC offset; report date filters need to agree with what
// Attendance/Day-End Report already mean by a given date.
export function localDateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    gte: from ? localDayStart(from) : undefined,
    lte: to ? localDayEnd(to) : undefined,
  };
}

function localDayStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function localDayEnd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

// For formReceivedDate/punchingDate — plain @db.Date columns written via parseDdMmYyyy as a pure
// UTC-midnight calendar-date encoding (never a real local instant). Querying a range against
// them needs that same UTC encoding, not localDateRange's local-timezone bounds (which are for
// genuine timestamp columns like createdAt and would drift by the office's UTC offset here).
export function utcDateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    gte: from ? utcDayStart(from) : undefined,
    lte: to ? utcDayEnd(to) : undefined,
  };
}

function utcDayStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDayEnd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}
