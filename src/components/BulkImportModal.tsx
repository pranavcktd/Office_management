import { useState } from "react";
import type { ChangeEvent } from "react";
import { api, extractErrorMessage } from "../api/client";
import type { BulkImportResult } from "../types";

interface Props {
  title: string;
  description: string;
  importPath: "/agents/import";
  templatePath: "/agents/import-template";
  templateFilename: string;
  onClose: () => void;
  onImported: () => void;
}

export function BulkImportModal({ title, description, importPath, templatePath, templateFilename, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  }

  async function onDownloadTemplate() {
    setDownloading(true);
    setError(null);
    try {
      const response = await api.get(templatePath, { responseType: "blob" });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = templateFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<BulkImportResult>(importPath, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      if (data.created > 0) onImported();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>

        <button
          type="button"
          onClick={onDownloadTemplate}
          disabled={downloading}
          className="mt-3 text-sm font-medium text-indigo-600 hover:underline disabled:opacity-60 dark:text-indigo-400"
        >
          {downloading ? "Downloading…" : "Download blank template"}
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
            onClick={onUpload}
            disabled={!file || uploading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Upload & Create"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-4">
            <div className="mb-2 flex gap-4 text-sm">
              <span className="text-slate-600 dark:text-slate-300">
                {result.totalRows} row{result.totalRows === 1 ? "" : "s"}
              </span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{result.created} created</span>
              <span className="font-medium text-red-700 dark:text-red-400">{result.failed} failed</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Outcome</th>
                    <th className="px-3 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {result.results.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-1.5">{r.row}</td>
                      <td
                        className={`px-3 py-1.5 font-medium ${
                          r.outcome === "created" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                        }`}
                      >
                        {r.outcome}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                        {r.outcome === "created"
                          ? r.reason
                            ? `${r.applicantName} — ${r.reason}`
                            : r.applicantName
                          : r.reason}
                      </td>
                    </tr>
                  ))}
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
