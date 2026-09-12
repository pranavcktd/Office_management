import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../api/client";
import type { MasterCategory } from "../types";

interface Props {
  kind: "SERVICE" | "DISPATCH_ITEM";
  value: number | "";
  onChange: (id: number) => void;
  className?: string;
  required?: boolean;
  /** allow the "+ Add new…" option (any staff can add) */
  allowCreate?: boolean;
}

const ADD_NEW = "__add_new__";

export function CategorySelect({ kind, value, onChange, className, required, allowCreate = true }: Props) {
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load(selectId?: number) {
    try {
      const { data } = await api.get<MasterCategory[]>(`/master/${kind}`);
      setCategories(data);
      if (selectId) onChange(selectId);
      else if (value === "" && data.length && !required) onChange(data[0].id);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function handleAddNew() {
    const name = window.prompt(`New ${kind === "SERVICE" ? "service category" : "item type"} name:`)?.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const { data } = await api.post<MasterCategory>(`/master/${kind}`, { name });
      await load(data.id);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <select
        className={className}
        value={value === "" ? "" : String(value)}
        required={required}
        disabled={creating}
        onChange={(e) => {
          if (e.target.value === ADD_NEW) {
            handleAddNew();
            return;
          }
          onChange(Number(e.target.value));
        }}
      >
        {required && value === "" && (
          <option value="" disabled>
            Select…
          </option>
        )}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        {allowCreate && <option value={ADD_NEW}>+ Add new…</option>}
      </select>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
