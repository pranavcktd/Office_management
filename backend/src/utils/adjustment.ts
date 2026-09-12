import { Prisma } from "@prisma/client";
import { ApiError } from "./asyncHandler";

type AdjustableTable = "pan_applications" | "tan_applications";

interface AdjustableDelegate {
  update: (args: { where: { id: number }; data: { adjustmentAvailable: boolean } }) => Promise<unknown>;
}

/**
 * Locks the prior rejected form row (SELECT ... FOR UPDATE) inside an active transaction,
 * verifies it is still eligible for adjustment, and atomically consumes the credit.
 * Must be called from within a prisma.$transaction callback so the lock is held until commit,
 * preventing two terminals from adjusting the same rejected form concurrently.
 */
export async function lockAndConsumeRejectedForm(
  tx: Prisma.TransactionClient,
  table: AdjustableTable,
  delegate: AdjustableDelegate,
  rejectedFormId: number
): Promise<void> {
  const rows = await tx.$queryRawUnsafe<{ id: number; adjustment_available: boolean }[]>(
    `SELECT id, adjustment_available FROM ${table} WHERE id = $1 FOR UPDATE`,
    rejectedFormId
  );

  if (rows.length === 0) {
    throw new ApiError(404, "The selected rejected form could not be found");
  }
  if (!rows[0].adjustment_available) {
    throw new ApiError(
      409,
      "This rejected form has already been adjusted or is no longer eligible"
    );
  }

  await delegate.update({
    where: { id: rejectedFormId },
    data: { adjustmentAvailable: false },
  });
}
