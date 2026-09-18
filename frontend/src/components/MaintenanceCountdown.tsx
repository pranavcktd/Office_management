import { useEffect, useState } from "react";

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function HourglassIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 4 2.5 6 5 8-2.5 2-5 4-5 8M17 3c0 4-2.5 6-5 8 2.5 2 5 4 5 8" />
    </svg>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function TimeBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="rounded-lg bg-stone-900 px-2.5 py-1.5 font-mono text-lg font-semibold tabular-nums text-white dark:bg-white dark:text-stone-900">
        {pad(value)}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-stone-400 dark:text-stone-500">{label}</span>
    </div>
  );
}

/** A live, ticking countdown to `until` — refreshes once a second entirely client-side (no
 * polling of its own; useMaintenanceStatus already re-fetches the actual enabled/until state
 * periodically, this just animates the time remaining between those refetches). */
export function MaintenanceCountdown({ until }: { until: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [until]);

  if (!until) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-stone-300">
        <HourglassIcon className="h-5 w-5 shrink-0 animate-pulse" />
        <span>Work in progress — no estimated time given yet.</span>
      </div>
    );
  }

  const diffMs = new Date(until).getTime() - now;
  if (diffMs <= 0) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-300">
        <HourglassIcon className="h-5 w-5 shrink-0 animate-spin [animation-duration:2s]" />
        <span>Should be back any moment now…</span>
      </div>
    );
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div>
      <div className="mb-2 flex items-center justify-center gap-1.5 text-xs font-medium text-stone-300">
        <ClockIcon className="h-3.5 w-3.5" />
        <span>Back in</span>
      </div>
      <div className="flex items-center justify-center gap-2">
        {days > 0 && <TimeBox value={days} label="days" />}
        <TimeBox value={hours} label="hrs" />
        <TimeBox value={minutes} label="min" />
        <TimeBox value={seconds} label="sec" />
      </div>
    </div>
  );
}
