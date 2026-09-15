import { prisma } from "../db/prisma";

// Admin-configurable column headers for the Protean Punching Report import — see the
// ProteanReportMapping model for the full rationale. Each value is a lowercase, distinctive
// fragment of the real column header (not the full text), matched as a substring against row 1
// of the uploaded file — so the admin can fix a header-wording change themselves under Settings
// without needing a code change. Fields not applicable to a module are simply left blank/null.
export type ProteanReportModule = "PAN" | "TAN";

export interface ProteanReportMappingFields {
  ackNumberHeader: string;
  applicantNameHeader: string | null;
  applicantLastNameHeader: string | null;
  firstNameHeader: string | null;
  middleNameHeader: string | null;
  fatherLastNameHeader: string | null;
  fatherFirstNameHeader: string | null;
  fatherMiddleNameHeader: string | null;
  dobHeader: string | null;
  emailHeader: string | null;
  mobileHeader: string | null;
  punchingDateHeader: string | null;
  applicationTypeHeader: string | null;
}

// These match the column wording seen in real Protean exports so far — used only until (and
// unless) an admin saves their own mapping under Settings → Protean Report Columns.
export const DEFAULT_PROTEAN_MAPPING: Record<ProteanReportModule, ProteanReportMappingFields> = {
  PAN: {
    ackNumberHeader: "acknowledg",
    applicantNameHeader: null,
    applicantLastNameHeader: "applicant last name",
    firstNameHeader: "first name",
    middleNameHeader: "middle name",
    fatherLastNameHeader: "father's last name",
    fatherFirstNameHeader: "father's first name",
    fatherMiddleNameHeader: "father's middle name",
    dobHeader: "date of birth",
    emailHeader: "email",
    mobileHeader: "telephone no",
    punchingDateHeader: "date",
    applicationTypeHeader: null,
  },
  TAN: {
    ackNumberHeader: "acknowledg",
    applicantNameHeader: "applicant name",
    applicantLastNameHeader: null,
    firstNameHeader: null,
    middleNameHeader: null,
    fatherLastNameHeader: null,
    fatherFirstNameHeader: null,
    fatherMiddleNameHeader: null,
    dobHeader: null,
    emailHeader: null,
    mobileHeader: null,
    punchingDateHeader: "receipt date",
    applicationTypeHeader: "application type",
  },
};

/** Returns the admin-saved mapping for a module, or the hardcoded defaults if nothing has been
 * saved yet — so the importer works out of the box and only needs Settings touched when a real
 * report's wording actually changes. */
export async function getProteanMapping(module: ProteanReportModule): Promise<ProteanReportMappingFields> {
  const row = await prisma.proteanReportMapping.findUnique({ where: { module } });
  return row ?? DEFAULT_PROTEAN_MAPPING[module];
}
