import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const isAgent = user?.role === "AGENT";
  const homePath = isAgent ? "/portal" : "/";

  const [fullName, setFullName] = useState(user?.fullName ?? user?.agentName ?? "");
  const [firmName, setFirmName] = useState(user?.firmName ?? "");
  const [mobile, setMobile] = useState(user?.mobile ?? "");
  const [address, setAddress] = useState(user?.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The AuthContext's cached `user` (from localStorage, possibly written by an older login
  // before profile fields existed) can lag behind the real record. Re-fetch on mount and sync
  // the form whenever a fresher `user` lands, instead of only reading it once at first render.
  useEffect(() => {
    refreshUser().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName ?? user.agentName ?? "");
    setFirmName(user.firmName ?? "");
    setMobile(user.mobile ?? "");
    setAddress(user.address ?? "");
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await api.patch("/auth/profile", {
        ...(isAgent ? { agentName: fullName, firmName, address } : { fullName }),
        mobile,
      });
      await refreshUser();
      setSaved(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">My Profile</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Update your contact details. Your email is your login and can't be changed here —
          contact your office admin if it needs to change.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Email (read-only)</label>
            <input className={inputClass} value={user?.email ?? ""} disabled />
          </div>
          <div>
            <label className={labelClass}>{isAgent ? "Agent Name" : "Full Name"}</label>
            <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          {isAgent && (
            <div>
              <label className={labelClass}>Firm Name</label>
              <input className={inputClass} value={firmName} onChange={(e) => setFirmName(e.target.value)} />
            </div>
          )}
          <div>
            <label className={labelClass}>Mobile</label>
            <input
              className={inputClass}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              maxLength={10}
              required
            />
          </div>
          {isAgent && (
            <div>
              <label className={labelClass}>Address</label>
              <textarea className={inputClass} rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Profile updated.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => navigate(homePath)}
            className="w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Back
          </button>
        </form>
      </div>
    </div>
  );
}
