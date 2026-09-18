// A 12-hour Hour / Minute / AM-PM picker — a drop-in replacement for <input type="time">, whose
// native AM/PM display depends entirely on the browser's locale and can silently render as a
// 24-hour clock with no AM/PM indicator at all (reported: staff marking attendance had no way to
// tell whether they were entering a morning or evening time). Value/onChange still use the same
// 24-hour "HH:MM" string every caller (and the backend) already expects, so this swaps in without
// touching any submission logic.
const selectClass =
  "rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

function to12Hour(hour24: number): { hour12: number; period: "AM" | "PM" } {
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, period };
}

function to24Hour(hour12: number, period: "AM" | "PM"): number {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export function TimeInput({
  value,
  onChange,
  className,
}: {
  /** 24-hour "HH:MM" string, or "" for unset — same contract as <input type="time">. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [hourPart, minutePart] = value ? value.split(":") : ["", ""];
  const hour24 = hourPart !== "" ? Number(hourPart) : null;
  const minute = minutePart !== "" ? Number(minutePart) : null;
  const parsed = hour24 !== null && !Number.isNaN(hour24) ? to12Hour(hour24) : null;
  const hour12 = parsed?.hour12 ?? null;
  const period = parsed?.period ?? "AM";

  function emit(nextHour12: number | null, nextMinute: number | null, nextPeriod: "AM" | "PM") {
    if (nextHour12 === null || nextMinute === null) {
      onChange("");
      return;
    }
    const h24 = to24Hour(nextHour12, nextPeriod);
    onChange(`${String(h24).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`);
  }

  return (
    <div className={`flex gap-1 ${className ?? ""}`}>
      <select
        value={hour12 ?? ""}
        onChange={(e) => emit(e.target.value ? Number(e.target.value) : null, minute, period)}
        className={`${selectClass} w-16`}
        aria-label="Hour"
      >
        <option value="">HH</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <select
        value={minute ?? ""}
        onChange={(e) => emit(hour12, e.target.value ? Number(e.target.value) : null, period)}
        className={`${selectClass} w-16`}
        aria-label="Minute"
      >
        <option value="">MM</option>
        {Array.from({ length: 60 }, (_, i) => i).map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        value={period}
        onChange={(e) => emit(hour12, minute, e.target.value as "AM" | "PM")}
        disabled={hour12 === null}
        className={`${selectClass} w-16 disabled:opacity-60`}
        aria-label="AM or PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
