/** Module access keys that can be granted to a STAFF member. ADMIN implicitly has all. */
export const MODULE_KEYS = ["pan", "tan", "agents", "attendance", "dispatch", "queries"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isModuleKey(v: string): v is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(v);
}
