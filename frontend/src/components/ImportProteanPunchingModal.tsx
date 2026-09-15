import { useState } from "react";
import type { ChangeEvent } from "react";
import { api, extractErrorMessage } from "../api/client";
import type { AckPunchingImportResult } from "../types";
import { ImportResultTable } from "./ImportResultTable";

interface Props {
  module: "PAN" | "TAN";
  onClose: () => void;
  onImported: () => void;
}

const DESCRIPTIONS: Record<"PAN" | "TAN", string> = {
  PAN:
    "Upload the report exactly as downloaded from Protean for your selected date range — no " +
    "reformatting needed. Applicant Name and Father's Name are built automatically from " +
    "Protean's own First/Middle/Last Name columns. Each row is matched to an existing " +
    "application by name plus Mobile/DOB; if nothing matches, a new walk-in (Office) record " +
    "is created automatically, already marked Acknowledgement Generated with the ack number " +
    "from the report.",
  TAN:
    "Upload the report exactly as downloaded from Protean for your selected date range — no " +
    "reformatting needed. This report carries no mobile or date of birth, so each row is " +
    "matched to a pending application by Applicant Name alone; more than one similarly-named " +
    "match is always sent to manual review rather than guessed. If nothing matches, a new " +
    "walk-in (Office) record is created automatically, already marked Acknowledgement " +
    "Generated with the ack number from the report.",
};

/** Upload Protean's own punching-status report exactly as downloaded from their portal — no
 * template, no reformatting. Shared by PAN and TAN; only the description and API paths differ. */
export function ImportProteanPunchingModal({ module, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AckPunchingImportResult | null>(null);
  const [finalResult, setFinalResult] = useState<AckPunchingImportResult | null>(null);

  const basePath = module === "PAN" ? "/pan" : "/tan";

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setPreview(null);
    setFinalResult(null);
    setError(null);
  }

  async function onDownloadTemplate() {
    const response = await api.get(`${basePath}/import-protean-punching-template`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${module.toLowerCase()}-protean-punching-report-sample.xlsx`;
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
      const { data } = await api.post<AckPunchingImportResult>(`${basePath}/import-protean-punching/preview`, formData, {
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
      const { data } = await api.post<AckPunchingImportResult>(`${basePath}/import-protean-punching`, formData, {
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
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Import Protean Punching Report
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{DESCRIPTIONS[module]}</p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Column headers not matching? A sample file showing the expected layout is available
          below — the actual text each column is matched against is configurable under Settings
          → Protean Report Columns, so a wording change from Protean never needs a code change.
        </p>

        <button
          type="button"
          onClick={onDownloadTemplate}
          className="mt-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Download Sample Template
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
                  A column marked ✗ won't be captured — Protean occasionally changes header wording
                  between report versions, so double-check that column's name in your file.
                </p>
              )}
            </div>
            <ImportResultTable result={preview} module={module} />
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
            <ImportResultTable result={finalResult} module={module} />
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
