import { useState } from "react";
import type { ChangeEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { AckPunchingImportResult } from "../../types";
import { ImportResultTable } from "../../components/ImportResultTable";

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function ImportAckPunchingModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [historicalImport, setHistoricalImport] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AckPunchingImportResult | null>(null);
  const [finalResult, setFinalResult] = useState<AckPunchingImportResult | null>(null);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setPreview(null);
    setFinalResult(null);
    setError(null);
  }

  async function onDownloadTemplate() {
    const response = await api.get("/pan/import-ack-punching-template", { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pan-ack-punching-template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onPreview() {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    setFinalResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("historicalImport", String(historicalImport));
      const { data } = await api.post<AckPunchingImportResult>("/pan/import-ack-punching/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPreviewing(false);
    }
  }

  async function onConfirmImport() {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("historicalImport", String(historicalImport));
      const { data } = await api.post<AckPunchingImportResult>("/pan/import-ack-punching", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFinalResult(data);
      setPreview(null);
      if (data.matched > 0 || data.created > 0) onImported();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Import Acknowledgement + Punching Date
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          For historical records (e.g. your 2021+ Protean report) and for routine batches going
          forward. Each row is matched to an existing application by Name plus whichever of
          Mobile/DOB you provide (most specific combination first); if nothing matches, a new
          walk-in (Office) record is created automatically with just the columns you gave —
          everything else is left blank for you to complete later.
        </p>

        <button
          type="button"
          onClick={onDownloadTemplate}
          className="mt-3 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Download Template
        </button>

        <div className="mt-4 flex items-center gap-3">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFileChange}
            className="flex-1 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
          />
          <button
            type="button"
            onClick={onPreview}
            disabled={!file || previewing || Boolean(finalResult)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {previewing ? "Reading…" : "Preview"}
          </button>
        </div>

        <label className="mt-3 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={historicalImport}
            disabled={Boolean(preview) || Boolean(finalResult)}
            onChange={(e) => setHistoricalImport(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            This is old/historical data (predates this system): don't flag rows with no matching
            entry as a "Missing Entry Alert", and instead of blocking a row as "conflict" (matched
            someone with a <em>different</em> ack number on file) or "ambiguous" (matched only by
            name+DOB, or too many possible matches), just create it as its own separate
            application — the existing application(s) it was compared against are never touched
            either way, so worst case is a harmless duplicate. Use this for backfilling past
            years; leave it unchecked for a routine/ongoing batch, where either case usually does
            mean something needs a look — staff skipped the office entry, the ack number on file
            might be a typo, or it's genuinely a different, unrelated person.
          </span>
        </label>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {preview && !finalResult && (
          <div className="mt-4">
            <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-medium">Preview only — nothing has been saved yet.</p>
              <p className="mt-1">
                Columns detected in row 1:{" "}
                {Object.entries(preview.detectedColumns ?? {}).map(([header, found], i) => (
                  <span key={header}>
                    {i > 0 && ", "}
                    <span className={found ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400 font-semibold"}>
                      {header} {found ? "✓" : "✗ not found"}
                    </span>
                  </span>
                ))}
              </p>
              {Object.values(preview.detectedColumns ?? {}).some((v) => !v) && (
                <p className="mt-1">
                  A column marked ✗ won't be captured — check that its header in your file matches the template exactly.
                </p>
              )}
            </div>
            <ImportResultTable result={preview} module="PAN" />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={onConfirmImport}
                disabled={importing}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {importing ? "Importing…" : "Looks good — Confirm Import"}
              </button>
            </div>
          </div>
        )}

        {finalResult && (
          <div className="mt-4">
            <p className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              Import complete — changes have been saved.
            </p>
            <ImportResultTable result={finalResult} module="PAN" allowConflictResolution onResolved={onImported} />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
