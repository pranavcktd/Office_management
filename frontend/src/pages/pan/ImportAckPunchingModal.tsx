import { useState } from "react";
import type { ChangeEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { AckPunchingImportResult } from "../../types";

interface Props {
  onClose: () => void;
  onImported: () => void;
}

const OUTCOME_STYLE: Record<string, string> = {
  matched: "text-emerald-700 dark:text-emerald-400",
  created: "text-blue-700 dark:text-blue-400",
  ambiguous: "text-amber-700 dark:text-amber-400",
  conflict: "text-red-700 dark:text-red-400",
  skipped: "text-slate-500 dark:text-slate-400",
};

export function ImportAckPunchingModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AckPunchingImportResult | null>(null);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
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

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<AckPunchingImportResult>("/pan/import-ack-punching", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      if (data.matched > 0 || data.created > 0) onImported();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
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
            accept=".xlsx,.csv"
            onChange={onFileChange}
            className="flex-1 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
          />
          <button
            type="button"
            onClick={onUpload}
            disabled={!file || uploading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {uploading ? "Processing…" : "Upload & Process"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap gap-4 text-sm">
              <span className="text-slate-600 dark:text-slate-300">
                {result.totalRows} row{result.totalRows === 1 ? "" : "s"}
              </span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{result.matched} matched</span>
              <span className="font-medium text-blue-700 dark:text-blue-400">{result.created} created</span>
              <span className="font-medium text-amber-700 dark:text-amber-400">{result.ambiguous} ambiguous</span>
              <span className="font-medium text-red-700 dark:text-red-400">{result.conflict} conflict</span>
              <span className="font-medium text-slate-500 dark:text-slate-400">{result.skipped} skipped</span>
            </div>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              Ambiguous and conflicting rows are never guessed — click into "Review" to open the
              application(s) in a new tab and resolve manually.
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Outcome</th>
                    <th className="px-3 py-2">Detail</th>
                    <th className="px-3 py-2">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {result.results.map((r) => {
                    const ids = Array.from(new Set([r.panApplicationId, ...(r.candidateIds ?? [])].filter((v): v is number => v != null)));
                    return (
                      <tr key={r.row}>
                        <td className="px-3 py-1.5">{r.row}</td>
                        <td className={`px-3 py-1.5 font-medium ${OUTCOME_STYLE[r.outcome]}`}>{r.outcome}</td>
                        <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                          {r.outcome === "matched" || r.outcome === "created"
                            ? r.reason ?? `#${r.panApplicationId} — ${r.applicantName} → ${r.ackNumber}`
                            : r.reason}
                        </td>
                        <td className="px-3 py-1.5">
                          {ids.map((id, i) => (
                            <span key={id}>
                              {i > 0 && ", "}
                              <a
                                href={`/pan/${id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                              >
                                #{id}
                              </a>
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
