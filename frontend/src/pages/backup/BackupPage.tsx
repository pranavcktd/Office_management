import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";

function filenameFromDisposition(header: string | undefined, fallback: string): string {
  const match = header?.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? fallback;
}

async function downloadBlob(path: string, fallbackName: string) {
  const response = await api.get(path, { responseType: "blob" });
  const filename = filenameFromDisposition(response.headers["content-disposition"], fallbackName);
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function BackupPage() {
  const [exporting, setExporting] = useState<"json" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);
  const restoreFileInput = useRef<HTMLInputElement>(null);

  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wiping, setWiping] = useState(false);

  async function onExport(format: "json" | "xlsx") {
    setExporting(format);
    setError(null);
    setMessage(null);
    try {
      await downloadBlob(`/backup/export.${format}`, `office-backup.${format}`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  function onRestoreFileChange(e: ChangeEvent<HTMLInputElement>) {
    setRestoreFile(e.target.files?.[0] ?? null);
  }

  async function onRestore() {
    if (!restoreFile || restoreConfirm !== "RESTORE") return;
    setRestoring(true);
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", restoreFile);
      fd.append("confirm", "RESTORE");
      await api.post("/backup/restore", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMessage("Restore completed. All data now matches the uploaded backup.");
      setRestoreFile(null);
      setRestoreConfirm("");
      if (restoreFileInput.current) restoreFileInput.current.value = "";
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setRestoring(false);
    }
  }

  async function onWipe() {
    if (wipeConfirm !== "WIPE") return;
    setWiping(true);
    setError(null);
    setMessage(null);
    try {
      const { data } = await api.post("/backup/wipe", { confirm: "WIPE" });
      setMessage(
        `Data wiped. A full backup was emailed to ${data.adminEmail} before anything was removed. Records removed: ${Object.entries(
          data.counts as Record<string, number>
        )
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")}`
      );
      setWipeConfirm("");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setWiping(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Backup &amp; Restore</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Export a full copy of office data, restore from a previous export, or wipe everything back to a clean state.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      )}
      {message && (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {message}
        </p>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Export Backup</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          The <strong>.json</strong> file is the full-fidelity backup — use it to restore. The <strong>.xlsx</strong> file is a
          human-readable copy for review, split into one sheet per module — it can't be used to restore.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onExport("json")}
            disabled={exporting !== null}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {exporting === "json" ? "Exporting…" : "Download JSON Backup"}
          </button>
          <button
            onClick={() => onExport("xlsx")}
            disabled={exporting !== null}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {exporting === "xlsx" ? "Exporting…" : "Download Excel Copy"}
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950">
        <h2 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">Restore from Backup</h2>
        <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
          This replaces <strong>all current data</strong> with what's in the uploaded JSON file. Everything as it stands right
          now will be lost unless you've exported it first. This cannot be undone.
        </p>
        <input
          ref={restoreFileInput}
          type="file"
          accept=".json"
          onChange={onRestoreFileChange}
          className="mb-3 block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={restoreConfirm}
            onChange={(e) => setRestoreConfirm(e.target.value)}
            placeholder='Type "RESTORE" to confirm'
            className="w-56 rounded-lg border border-amber-300 px-2.5 py-1.5 text-sm dark:border-amber-800 dark:bg-slate-800 dark:text-white"
          />
          <button
            onClick={onRestore}
            disabled={!restoreFile || restoreConfirm !== "RESTORE" || restoring}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {restoring ? "Restoring…" : "Restore Now"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-red-300 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950">
        <h2 className="mb-2 text-sm font-semibold text-red-800 dark:text-red-300">Wipe All Data</h2>
        <p className="mb-3 text-sm text-red-700 dark:text-red-400">
          Removes all PAN/TAN applications, agents, staff (except your own admin login), dispatch entries, and client
          queries. Office setup (master categories, fee schedule, field requirements, email settings) is kept. A full
          backup is taken and emailed to your admin address automatically before anything is removed. This cannot be
          undone.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={wipeConfirm}
            onChange={(e) => setWipeConfirm(e.target.value)}
            placeholder='Type "WIPE" to confirm'
            className="w-56 rounded-lg border border-red-300 px-2.5 py-1.5 text-sm dark:border-red-800 dark:bg-slate-800 dark:text-white"
          />
          <button
            onClick={onWipe}
            disabled={wipeConfirm !== "WIPE" || wiping}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {wiping ? "Wiping…" : "Wipe All Data"}
          </button>
        </div>
      </div>
    </div>
  );
}
