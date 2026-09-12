import { AttendanceStatus } from "@prisma/client";

const FULL_DAY_MINUTES = 8 * 60;
const OVERTIME_MINUTES = 9 * 60;

// Standard office hours used by the one-click "Mark Full Day" shortcut — most staff work one
// continuous day rather than genuinely splitting into two shifts, so this covers the common
// case without requiring a punch-in and punch-out at the actual start/end of the day.
export const FULL_DAY_START_HHMM = "10:00";
export const FULL_DAY_END_HHMM = "18:00";

function minutesBetween(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const diff = end.getTime() - start.getTime();
  return diff > 0 ? diff / 60000 : 0;
}

export function computeAttendanceStatus(record: {
  shift1In: Date | null;
  shift1Out: Date | null;
  shift2In: Date | null;
  shift2Out: Date | null;
}): AttendanceStatus {
  const { shift1In, shift1Out, shift2In, shift2Out } = record;
  const hasAnyPunch = Boolean(shift1In || shift1Out || shift2In || shift2Out);

  if (!hasAnyPunch) {
    return AttendanceStatus.ABSENT;
  }

  const totalMinutes =
    minutesBetween(shift1In, shift1Out) + minutesBetween(shift2In, shift2Out);

  if (totalMinutes === 0) {
    // A shift has started but not yet closed out (day in progress) or punches are incomplete.
    return AttendanceStatus.PRESENT;
  }
  if (totalMinutes >= OVERTIME_MINUTES) {
    return AttendanceStatus.OVERTIME;
  }
  if (totalMinutes >= FULL_DAY_MINUTES) {
    return AttendanceStatus.PRESENT;
  }
  return AttendanceStatus.HALF_DAY;
}

export function totalWorkedMinutes(record: {
  shift1In: Date | null;
  shift1Out: Date | null;
  shift2In: Date | null;
  shift2Out: Date | null;
}): number {
  return (
    minutesBetween(record.shift1In, record.shift1Out) +
    minutesBetween(record.shift2In, record.shift2Out)
  );
}
