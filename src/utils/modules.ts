/** Module access keys that can be granted to a STAFF member. ADMIN implicitly has all.
 * Attendance is deliberately not here — it's universal self-service, not a discretionary
 * business-function grant, so every staff member always has access (see app.ts). */
export const MODULE_KEYS = ["pan", "tan", "agents", "dispatch", "queries"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isModuleKey(v: string): v is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(v);
}
