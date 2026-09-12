import { prisma } from "../db/prisma";

export type FeeModuleKey = "PAN" | "TAN";
export type FeeApplicationType = "NEW" | "CORRECTION";
/** "" for TAN (no signature/thumb distinction); "SIGNATURE" or "THUMB" for PAN. */
export type FeeSignedStatus = "" | "SIGNATURE" | "THUMB";

interface LookupInput {
  module: FeeModuleKey;
  applicationType: FeeApplicationType;
  signedStatus: FeeSignedStatus;
  sourceType: "OFFICE" | "AGENT";
  agentId?: number | null;
  /** The rate that was in effect on this date is used, not necessarily the current one — so
   * editing the fee schedule today never silently changes what an older form's fee was. Defaults
   * to now, for live "what would this cost today" lookups. */
  asOf?: Date;
}

/** Truncates to a calendar day (UTC midnight) so multiple edits on the same day update that
 * day's version instead of piling up near-duplicate rows. */
export function truncateToDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Resolves the office's fixed fee for a form category as of a given date: the agent's own
 * negotiated rate when sourceType is AGENT and one was on file by then, else the office-wide
 * walk-in default in effect then. Returns null (never throws) when no rate has been configured
 * for that category as of that date, so form entry is never blocked by a missing fee-schedule row.
 */
export async function lookupStandardFee(input: LookupInput): Promise<number | null> {
  const asOf = input.asOf ?? new Date();

  if (input.sourceType === "AGENT" && input.agentId) {
    const agentRate = await prisma.agentFeeRate.findFirst({
      where: {
        agentId: input.agentId,
        module: input.module,
        applicationType: input.applicationType,
        signedStatus: input.signedStatus,
        effectiveFrom: { lte: asOf },
      },
      orderBy: { effectiveFrom: "desc" },
    });
    // A non-null row is a real override; a null-amount row is an explicit "reverted to
    // default from this date" marker, so either way it settles whether an override applies.
    if (agentRate) {
      if (agentRate.amount !== null) return Number(agentRate.amount);
    }
  }

  const fallback = await prisma.feeScheduleDefault.findFirst({
    where: {
      module: input.module,
      applicationType: input.applicationType,
      signedStatus: input.signedStatus,
      effectiveFrom: { lte: asOf },
    },
    orderBy: { effectiveFrom: "desc" },
  });
  return fallback ? Number(fallback.amount) : null;
}

/** Collapses a set of dated rate versions down to the latest one per category (as of whatever
 * date they were already queried for) — shared by the office-default and agent-rate "what's the
 * current matrix look like for editing" views. */
export function pickLatestVersions<T extends { effectiveFrom: Date }>(rows: T[], keyFn: (r: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const r of [...rows].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())) {
    const key = keyFn(r);
    if (!map.has(key)) map.set(key, r);
  }
  return map;
}

export const FEE_CATEGORIES: Record<FeeModuleKey, Array<{ applicationType: FeeApplicationType; signedStatus: FeeSignedStatus; label: string }>> = {
  PAN: [
    { applicationType: "NEW", signedStatus: "SIGNATURE", label: "New PAN — Signature" },
    { applicationType: "NEW", signedStatus: "THUMB", label: "New PAN — Thumb Impression" },
    { applicationType: "CORRECTION", signedStatus: "SIGNATURE", label: "Correction PAN — Signature" },
    { applicationType: "CORRECTION", signedStatus: "THUMB", label: "Correction PAN — Thumb Impression" },
  ],
  TAN: [
    { applicationType: "NEW", signedStatus: "", label: "New TAN" },
    { applicationType: "CORRECTION", signedStatus: "", label: "Correction TAN" },
  ],
};

/** Saves (or replaces) the version of this rate effective from the given date — defaults to
 * today. Saving again on the same day updates that day's version rather than creating a new one;
 * a future-dated save leaves every earlier version, and any form dated before it, untouched. */
export async function upsertFeeScheduleDefault(
  module: FeeModuleKey,
  applicationType: FeeApplicationType,
  signedStatus: FeeSignedStatus,
  amount: number,
  effectiveFrom: Date = new Date()
) {
  const ef = truncateToDate(effectiveFrom);
  return prisma.feeScheduleDefault.upsert({
    where: { module_applicationType_signedStatus_effectiveFrom: { module, applicationType, signedStatus, effectiveFrom: ef } },
    create: { module, applicationType, signedStatus, amount, effectiveFrom: ef },
    update: { amount },
  });
}

/** amount: null saves an explicit "reverted to office default from this date" version rather
 * than deleting history — lookupStandardFee treats a null-amount row as "no override applies". */
export async function upsertAgentFeeRate(
  agentId: number,
  module: FeeModuleKey,
  applicationType: FeeApplicationType,
  signedStatus: FeeSignedStatus,
  amount: number | null,
  effectiveFrom: Date = new Date()
) {
  const ef = truncateToDate(effectiveFrom);
  await prisma.agentFeeRate.upsert({
    where: { agentId_module_applicationType_signedStatus_effectiveFrom: { agentId, module, applicationType, signedStatus, effectiveFrom: ef } },
    create: { agentId, module, applicationType, signedStatus, amount, effectiveFrom: ef },
    update: { amount },
  });
}
