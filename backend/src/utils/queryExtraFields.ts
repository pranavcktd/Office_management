/** Extra ClientQuery fields a SERVICE category can require — e.g. "Aadhaar-PAN Link Request"
 * needs PAN + AADHAAR, "Income Tax Query" needs PAN + TAX_YEAR. Admin picks which apply per
 * category (MasterCategory.requiredQueryFields); the query entry form shows/requires only those
 * fields for the currently-selected category. */
export const QUERY_EXTRA_FIELDS = ["PAN", "AADHAAR", "TAX_YEAR"] as const;
export type QueryExtraField = (typeof QUERY_EXTRA_FIELDS)[number];

export const QUERY_EXTRA_FIELD_LABELS: Record<QueryExtraField, string> = {
  PAN: "PAN Number",
  AADHAAR: "Aadhaar Number",
  TAX_YEAR: "Tax Year",
};
