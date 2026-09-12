import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { AppDocument } from "../../types";
import { formatDateTime } from "../../utils/date";

export function AgentDocumentsPage() {
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AppDocument[]>("/documents")
      .then(({ data }) => setDocuments(data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  async function onDownload(doc: AppDocument) {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Documents</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Form templates and formats shared by the office.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && documents.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No documents available yet.
                </td>
              </tr>
            )}
            {documents.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{d.title}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.description ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(d.createdAt)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDownload(d)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
