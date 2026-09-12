import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { FieldRequirementEntry } from "../types";

/** Loads the admin-configured required/optional map for a PAN/TAN form's "soft" fields,
 * falling back to `true` (required) for any key not yet loaded so the form stays safe. */
export function useFieldRequirements(module: "PAN" | "TAN") {
  const [required, setRequired] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<{ fields: FieldRequirementEntry[] }>(`/settings/field-requirements/${module}`)
      .then(({ data }) => {
        setRequired(Object.fromEntries(data.fields.map((f) => [f.key, f.required])));
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [module]);

  const isRequired = (key: string) => required[key] ?? true;
  return { isRequired, loaded };
}
