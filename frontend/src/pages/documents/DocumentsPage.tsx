import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Pagination } from "../../components/Pagination";
import type { AppDocument, PaginatedResponse } from "../../types";
import { formatDateTime } from "../../utils/date";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

export function DocumentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<AppDocument>>("/documents", { params: { page, pageSize } });
      setDocuments(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      if (description) fd.append("description", description);
      fd.append("file", file);
      await api.post("/documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

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

  async function onDelete(doc: AppDocument) {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    try {
      await api.delete(`/documents/${doc.id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Documents</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Form templates and formats — visible here and in the agent portal for direct download.
        </p>
      </div>

      {isAdmin && (
        <form
          onSubmit={onUpload}
          className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <label className={labelClass}>Title</label>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>File</label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Description (optional)</label>
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={uploading || !file}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload Document"}
            </button>
          </div>
        </form>
      )}

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
              <th className="px-4 py-3">Uploaded By</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && documents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No documents uploaded yet.
                </td>
              </tr>
            )}
            {documents.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{d.title}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.description ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.uploadedBy?.fullName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(d.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onDownload(d)}
                      title="Download"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      ⬇️
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => onDelete(d)}
                        title="Delete"
                        className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
