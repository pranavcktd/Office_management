import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Params {
  module: "pan" | "tan";
  applicationType: string;
  signedStatus?: string;
  sourceType: string;
  agentId?: string;
}

/** Live "what's the fixed fee for this category?" lookup — refetches whenever the category-
 * defining fields change, so the form can show it before the applicant's payment is entered. */
export function useStandardFee({ module, applicationType, signedStatus, sourceType, agentId }: Params) {
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    if (sourceType === "AGENT" && !agentId) {
      setAmount(null);
      return;
    }
    let cancelled = false;
    api
      .get<{ amount: number | null }>(`/${module}/standard-fee`, {
        params: { applicationType, signedStatus, sourceType, agentId: sourceType === "AGENT" ? agentId : undefined },
      })
      .then(({ data }) => {
        if (!cancelled) setAmount(data.amount);
      })
      .catch(() => {
        if (!cancelled) setAmount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [module, applicationType, signedStatus, sourceType, agentId]);

  return amount;
}
