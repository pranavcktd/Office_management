import type { ReactNode } from "react";

/** A form field label with an explicit "(Required)" / "(Optional)" hint. */
export function FieldLabel({ required, children }: { required: boolean; children: ReactNode }) {
  return (
    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
      {children} <span className="font-normal text-slate-400">{required ? "(Required)" : "(Optional)"}</span>
    </label>
  );
}
