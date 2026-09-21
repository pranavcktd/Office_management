import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { FieldLabel } from "../../components/FieldLabel";
import { MODULE_KEYS, MODULE_LABELS } from "../../types";
import type { ModuleKey, Staff, StaffRole } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

interface FormState {
  fullName: string;
  mobile: string;
  email: string;
  role: StaffRole;
  modules: ModuleKey[];
}

const initialState: FormState = {
  fullName: "",
  mobile: "",
  email: "",
  role: "STAFF",
  modules: [],
};

export function UserFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get<Staff>(`/staff/${id}`)
      .then(({ data }) => {
        setForm({
          fullName: data.fullName,
          mobile: data.mobile,
          email: data.email ?? "",
          role: data.role,
          modules: data.modules ?? [],
        });
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleModule(m: ModuleKey) {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.includes(m) ? prev.modules.filter((x) => x !== m) : [...prev.modules, m],
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await api.patch(`/staff/${id}`, {
          fullName: form.fullName,
          mobile: form.mobile,
          email: form.email,
          role: form.role,
          modules: form.modules,
        });
      } else {
        await api.post("/staff", {
          fullName: form.fullName,
          mobile: form.mobile,
          email: form.email,
          role: form.role,
          modules: form.modules,
        });
      }
      navigate("/users");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        {isEdit ? `Edit User #${id}` : "New User"}
      </h1>
      {!isEdit && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          The account starts on the default password and the user must change it on first login.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Full Name</FieldLabel>
            <input
              autoFocus
              className={inputClass}
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value.toUpperCase())}
              required
            />
          </div>
          <div>
            <FieldLabel required>Mobile Number</FieldLabel>
            <input
              className={inputClass}
              placeholder="10 digits"
              inputMode="numeric"
              maxLength={10}
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>
              Email <span className="font-normal text-slate-400">(used to sign in)</span>
            </FieldLabel>
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => set("email", e.target.value.toUpperCase())}
              required
            />
          </div>
          <div>
            <FieldLabel required>Role</FieldLabel>
            <select
              className={inputClass}
              value={form.role}
              onChange={(e) => set("role", e.target.value as StaffRole)}
            >
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
              <option value="AUDITOR">Auditor</option>
            </select>
          </div>
        </div>

        {form.role === "AUDITOR" && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            An auditor can view every module's data — PAN, TAN, Agents, Attendance, Reports, Audit
            Trail, etc. — without any module access needing to be granted individually, but can
            never create, edit, or delete anything.
          </p>
        )}

        {form.role === "STAFF" && (
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">Module Access</p>
            <div className="grid grid-cols-2 gap-1.5">
              {MODULE_KEYS.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={form.modules.includes(m)} onChange={() => toggleModule(m)} />
                  {MODULE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/users")}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
