import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { FieldRequirementEntry } from "../../types";

function ModuleFieldRequirements({ module, title }: { module: "PAN" | "TAN"; title: string }) {
  const [fields, setFields] = useState<FieldRequirementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ fields: FieldRequirementEntry[] }>(`/settings/field-requirements/${module}`);
      setFields(data.fields);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  function toggle(key: string) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, required: !f.required } : f)));
    setSaved(false);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put<{ fields: FieldRequirementEntry[] }>(`/settings/field-requirements/${module}`, {
        fields: Object.fromEntries(fields.map((f) => [f.key, f.required])),
      });
      setFields(data.fields);
      setSaved(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {fields.map((f) => (
              <li key={f.key} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-800 dark:text-slate-200">{f.label}</span>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <input type="checkbox" checked={f.required} onChange={() => toggle(f.key)} />
                  Required
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</span>}
          </div>
        </>
      )}
    </div>
  );
}

export function FieldRequirementsSettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Choose which fields on the PAN and TAN entry forms are mandatory. A handful (name,
        mobile, date of birth, Aadhaar, fees) are mandatory by default — turn any of them off,
        or make an optional one mandatory, as your workflow needs.
      </p>
      <ModuleFieldRequirements module="PAN" title="PAN Application Fields" />
      <ModuleFieldRequirements module="TAN" title="TAN Application Fields" />
    </div>
  );
}
