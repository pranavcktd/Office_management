import type { AckPunchingImportResult } from "../types";

const OUTCOME_STYLE: Record<string, string> = {
  matched: "text-emerald-700 dark:text-emerald-400",
  created: "text-blue-700 dark:text-blue-400",
  ambiguous: "text-amber-700 dark:text-amber-400",
  conflict: "text-red-700 dark:text-red-400",
  skipped: "text-slate-500 dark:text-slate-400",
};

export function ImportResultTable({ result, module }: { result: AckPunchingImportResult; module: "PAN" | "TAN" }) {
  const basePath = module === "PAN" ? "/pan" : "/tan";
  const discrepancyRowCount = result.results.filter((r) => (r.discrepancies?.length ?? 0) > 0).length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          {result.totalRows} row{result.totalRows === 1 ? "" : "s"}
        </span>
        <span className="font-medium text-emerald-700 dark:text-emerald-400">{result.matched} matched</span>
        <span className="font-medium text-blue-700 dark:text-blue-400">{result.created} created</span>
        <span className="font-medium text-amber-700 dark:text-amber-400">{result.ambiguous} ambiguous</span>
        <span className="font-medium text-red-700 dark:text-red-400">{result.conflict} conflict</span>
        <span className="font-medium text-slate-500 dark:text-slate-400">{result.skipped} skipped</span>
        {discrepancyRowCount > 0 && (
          <span className="font-medium text-orange-700 dark:text-orange-400">
            ⚠ {discrepancyRowCount} data entry mismatch{discrepancyRowCount === 1 ? "" : "es"}
          </span>
        )}
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Ambiguous and conflicting rows are never guessed — click into "Review" to open the
        application(s) in a new tab and resolve manually. A ⚠ row still matched and updated
        normally, but disagreed with what's already on file for one or more fields — these are
        also logged under Reports → Data Entry Accuracy for review.
      </p>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2">Parsed From Row</th>
              <th className="px-3 py-2">Data Entry Check</th>
              <th className="px-3 py-2">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.results.map((r) => {
              const primaryId = r.panApplicationId ?? r.tanApplicationId;
              const ids = Array.from(new Set([primaryId, ...(r.candidateIds ?? [])].filter((v): v is number => v != null)));
              return (
                <tr key={r.row}>
                  <td className="px-3 py-1.5">{r.row}</td>
                  <td className={`px-3 py-1.5 font-medium ${OUTCOME_STYLE[r.outcome]}`}>{r.outcome}</td>
                  <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                    {r.outcome === "matched" || r.outcome === "created"
                      ? r.reason ?? `${r.applicantName} → ${r.ackNumber}`
                      : r.reason}
                  </td>
                  <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">
                    {r.parsedRow ? (
                      <>
                        {r.parsedRow.dob && <span className="mr-2">DOB {r.parsedRow.dob}</span>}
                        {r.parsedRow.mobile && <span className="mr-2">Mob {r.parsedRow.mobile}</span>}
                        {r.parsedRow.email && <span className="mr-2">Email {r.parsedRow.email}</span>}
                        {r.parsedRow.fatherName && <span className="mr-2">Father {r.parsedRow.fatherName}</span>}
                        {r.parsedRow.punchingDate && <span>Punched {r.parsedRow.punchingDate}</span>}
                        {!r.parsedRow.dob && !r.parsedRow.mobile && !r.parsedRow.email && !r.parsedRow.fatherName && !r.parsedRow.punchingDate && "—"}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.discrepancies && r.discrepancies.length > 0 ? (
                      <span
                        className="font-medium text-orange-700 dark:text-orange-400"
                        title={r.discrepancies.map((d) => `${d.field}: on file "${d.entered}" vs report "${d.reported}"`).join("\n")}
                      >
                        ⚠ {r.discrepancies.map((d) => d.field).join(", ")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {ids.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ", "}
                        <a
                          href={`${basePath}/${id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          #{id}
                        </a>
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
