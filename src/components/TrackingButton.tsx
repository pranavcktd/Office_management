import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { TrackingLink, TrackingLinkModule } from "../types";

const DEFAULT_LABELS: Record<TrackingLinkModule, string> = {
  PAN: "Track PAN Application",
  TAN: "Track TAN Application",
  DISPATCH: "Track",
};

/** Opens an admin-configured external tracking URL in a new tab — the actual URL never needs a
 * code change, just a Settings edit (see TrackingLinksSettingsPage). PAN/TAN normally have one
 * active link and the button opens it directly; if more than one is configured (or for
 * Dispatch's multiple couriers), a small dropdown picks which one to open. Renders nothing if no
 * active link is configured for the module, so it never shows a dead button. */
export function TrackingButton({ module, label }: { module: TrackingLinkModule; label?: string }) {
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<TrackingLink[]>(`/tracking-links/${module}`)
      .then(({ data }) => {
        setLinks(data);
        if (data.length > 0) setSelected(String(data[0].id));
      })
      .catch(() => setLinks([]))
      .finally(() => setLoaded(true));
  }, [module]);

  if (!loaded || links.length === 0) return null;

  function openSelected() {
    const link = links.find((l) => String(l.id) === selected);
    if (link) window.open(link.url, "_blank", "noopener,noreferrer");
  }

  if (links.length === 1) {
    return (
      <button
        type="button"
        onClick={openSelected}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        🔗 {label ?? DEFAULT_LABELS[module]}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      >
        {links.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={openSelected}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        🔗 {label ?? DEFAULT_LABELS[module]}
      </button>
    </div>
  );
}
