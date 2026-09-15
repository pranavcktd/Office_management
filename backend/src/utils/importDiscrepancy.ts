import { prisma } from "../db/prisma";
import { normalizeNameForMatch } from "./nameMatch";

// Caught during a Protean Punching Report import: the office's own on-file data (typed in by
// staff at entry) disagrees with what Protean's report says for the same application, even
// though the row matched confidently enough (by name/mobile/DOB) to be the same person. This is
// exactly the "minor mistake" scenario a data-entry typo produces — flagging it lets an admin see
// which staff need a word of caution, without denying the update itself (the matched row is still
// updated/ack'd normally; this only records the disagreement for later review).

export interface FieldDiscrepancy {
  field: string;
  entered: string;
  reported: string;
}

/** Only flags a field when the office's own record already had a value in it — filling a
 * previously-blank field from the report is normal and not a discrepancy. Compares names after
 * normalizing case/punctuation/whitespace so a purely cosmetic difference (extra space, different
 * capitalization) isn't flagged as a mistake. */
export function compareNameField(
  field: string,
  entered: string | null | undefined,
  reported: string | null | undefined
): FieldDiscrepancy | null {
  if (!entered || !reported) return null;
  if (normalizeNameForMatch(entered) === normalizeNameForMatch(reported)) return null;
  return { field, entered, reported };
}

export function compareTextField(
  field: string,
  entered: string | null | undefined,
  reported: string | null | undefined
): FieldDiscrepancy | null {
  if (!entered || !reported) return null;
  if (entered.trim().toLowerCase() === reported.trim().toLowerCase()) return null;
  return { field, entered, reported };
}

export function compareDateField(
  field: string,
  entered: Date | null | undefined,
  reported: Date | null | undefined
): FieldDiscrepancy | null {
  if (!entered || !reported) return null;
  if (entered.getTime() === reported.getTime()) return null;
  return { field, entered: entered.toISOString().slice(0, 10), reported: reported.toISOString().slice(0, 10) };
}

export async function recordDiscrepancies(
  module: "PAN" | "TAN",
  applicationId: number,
  ackNumber: string,
  staffId: number | null,
  discrepancies: FieldDiscrepancy[]
): Promise<void> {
  if (discrepancies.length === 0) return;
  await prisma.importDiscrepancy.createMany({
    data: discrepancies.map((d) => ({
      module,
      applicationId,
      ackNumber,
      field: d.field,
      enteredValue: d.entered,
      reportValue: d.reported,
      staffId,
    })),
  });
}
