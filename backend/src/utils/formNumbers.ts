/**
 * The old single Form 49A (Individual) / 49AA (Non-Individual) PAN split was replaced with
 * four residency-aware forms; corrections keep the plain CSF designation regardless.
 */
export function getPanFormNumber(
  applicationType: "NEW" | "CORRECTION",
  residencyStatus: "RESIDENT" | "NON_RESIDENT",
  applicantStatus: "INDIVIDUAL" | "NON_INDIVIDUAL"
): string {
  if (applicationType === "CORRECTION") return "CSF (Correction)";
  if (residencyStatus === "RESIDENT") return applicantStatus === "INDIVIDUAL" ? "Form 93" : "Form 94";
  return applicantStatus === "INDIVIDUAL" ? "Form 95" : "Form 96";
}

/**
 * The old single Form 49B TAN application was replaced by a Government (134) vs
 * Non-Government (135) split; corrections keep the plain "Correction" designation.
 */
export function getTanFormNumber(applicationType: "NEW" | "CORRECTION", applicantCategory: string): string {
  if (applicationType === "CORRECTION") return "Correction";
  return applicantCategory === "GOVERNMENT" ? "Form 134" : "Form 135";
}
