import { prisma } from "../db/prisma";

export type FieldRequirementModule = "PAN" | "TAN";

/**
 * The office's default required/optional state for each "soft" content field on the PAN/TAN
 * entry forms — structural fields (applicationType, panNumber-for-correction, agentId-for-
 * agent-source, paymentMode, etc.) have their own always-on conditional validation and are
 * not part of this configurable set. Admin can override any of these from Settings.
 */
export const DEFAULT_FIELD_REQUIREMENTS: Record<FieldRequirementModule, Record<string, boolean>> = {
  PAN: {
    applicantName: true,
    fatherName: false,
    dob: true,
    mobile: true,
    email: false,
    aadhaarNumber: true,
    feeAmount: true,
    notes: false,
  },
  TAN: {
    applicantName: true,
    dob: true,
    mobile: true,
    feeAmount: true,
    notes: false,
  },
};

export const FIELD_LABELS: Record<FieldRequirementModule, Record<string, string>> = {
  PAN: {
    applicantName: "Applicant / Entity Name",
    fatherName: "Father's Name",
    dob: "Date of Birth / Incorporation",
    mobile: "Mobile Number",
    email: "Email",
    aadhaarNumber: "Aadhaar Number",
    feeAmount: "Fees Paid",
    notes: "Notes",
  },
  TAN: {
    applicantName: "Name",
    dob: "Date of Incorporation / Birth",
    mobile: "Mobile Number",
    feeAmount: "Fees Paid",
    notes: "Notes",
  },
};

/** Merges the DB overrides on top of the hardcoded defaults — a field with no row yet keeps its default. */
export async function getFieldRequirements(module: FieldRequirementModule): Promise<Record<string, boolean>> {
  const rows = await prisma.fieldRequirement.findMany({ where: { module } });
  const merged = { ...DEFAULT_FIELD_REQUIREMENTS[module] };
  for (const row of rows) {
    if (row.fieldKey in merged) merged[row.fieldKey] = row.required;
  }
  return merged;
}

export async function setFieldRequirements(module: FieldRequirementModule, updates: Record<string, boolean>): Promise<void> {
  const validKeys = Object.keys(DEFAULT_FIELD_REQUIREMENTS[module]);
  const writes = Object.entries(updates).filter(([key]) => validKeys.includes(key));
  await prisma.$transaction(
    writes.map(([fieldKey, required]) =>
      prisma.fieldRequirement.upsert({
        where: { module_fieldKey: { module, fieldKey } },
        create: { module, fieldKey, required },
        update: { required },
      })
    )
  );
}
