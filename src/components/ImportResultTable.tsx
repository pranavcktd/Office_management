import { useState } from "react";
import { api, extractErrorMessage } from "../api/client";
import type { AckPunchingImportResult } from "../types";

const OUTCOME_STYLE: Record<string, string> = {
  matched: "text-emerald-700 dark:text-emerald-400",
  created: "text-red-700 dark:text-red-400",
  ambiguous: "text-amber-700 dark:text-amber-400",
  conflict: "text-red-700 dark:text-red-400",
  skipped: "text-slate-500 dark:text-slate-400",
};

interface Props {
  result: AckPunchingImportResult;
  module: "PAN" | "TAN";
  /** Only offer "Create as separate application" on conflict rows when this is the result of a
   * real (non-dry-run) import — a preview hasn't saved anything yet, so there's nothing to
   * disambiguate against. Currently PAN-only; see pan.controller.ts's createPanFromConflictRow. */
  allowConflictResolution?: boolean;
  /** Called after a conflict row is successfully resolved into a new application, so the caller
   * can refresh whatever list is showing behind the modal. */
  onResolved?: () => void;
}

type OutcomeFilter = "all" | "matched" | "created" | "ambiguous" | "conflict" | "skipped";

export function ImportResultTable({ result, module, allowConflictResolution, onResolved }: Props) {
  const basePath = module === "PAN" ? "/pan" : "/tan";
  const discrepancyRowCount = result.results.filter((r) => (r.discrepancies?.length ?? 0) > 0).length;
  const [resolvedRows, setResolvedRows] = useState<Record<number, number>>({});
  const [resolvingRow, setResolvingRow] = useState<number | null>(null);
  const [resolveErrors, setResolveErrors] = useState<Record<number, string>>({});
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [search, setSearch] = useState("");

  const visibleResults = result.results.filter((r) => {
    if (outcomeFilter !== "all" && r.outcome !== outcomeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!r.applicantName?.toLowerCase().includes(q) && !r.ackNumber?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  async function onCreateSeparate(row: number, applicantName: string, ackNumber: string, parsedRow: AckPunchingImportResult["results"][number]["parsedRow"]) {
    if (
      !window.confirm(
        `Create a brand-new PAN application for "${applicantName}" (Ack ${ackNumber})?\n\nOnly do this if you've confirmed this is a genuine separate/correction application by the same person — not a data-entry mistake on the existing match.`
      )
    ) {
      return;
    }
    setResolvingRow(row);
    setResolveErrors((prev) => ({ ...prev, [row]: "" }));
    try {
      const { data } = await api.post<{ id: number }>("/pan/import-ack-punching/create-from-conflict", {
        applicantName,
        ackNumber,
        dob: parsedRow?.dob ?? null,
        mobile: parsedRow?.mobile ?? null,
        email: parsedRow?.email ?? null,
        fatherName: parsedRow?.fatherName ?? null,
        punchingDate: parsedRow?.punchingDate ?? null,
        historicalImport: result.historicalImport ?? false,
      });
      setResolvedRows((prev) => ({ ...prev, [row]: data.id }));
      onResolved?.();
    } catch (err) {
      setResolveErrors((prev) => ({ ...prev, [row]: extractErrorMessage(err) }));
    } finally {
      setResolvingRow(null);
    }
  }

  return (
    <div>
      {result.created > 0 && result.historicalImport && (
        <div className="mb-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <p className="font-semibold">
            {result.created} application{result.created === 1 ? "" : "s"} were created as historical records.
          </p>
          <p className="mt-1 text-xs">
            Marked as historical/backfill data, so these are not flagged as a "Missing Entry
            Alert" — that's expected here since this data predates the office system. A row that
            matched an existing application (a different ack number on file, or a name+DOB match
            too weak to auto-apply) was created as its own separate record instead of being
            blocked as "conflict"/"ambiguous" — see each row's Detail column for which existing
            application(s) it was compared against.
          </p>
        </div>
      )}
      {result.created > 0 && !result.historicalImport && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <p className="font-semibold">
            ⚠️ {result.created} application{result.created === 1 ? "" : "s"} had no matching entry in the system at all.
          </p>
          <p className="mt-1 text-xs">
            Protean/NSDL already has these, but nobody entered them here first — a walk-in record
            was auto-created to cover it, but this usually means a staff member processed the
            application without doing the office data entry. Review the "created" rows below
            (also filterable on the {module} list as "Missing Entry Alert") and follow up with
            whoever handled them. If this batch is actually old/historical data, re-import it with
            the "historical data" checkbox ticked instead.
          </p>
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm">
        {(
          [
            { key: "all", label: `${result.totalRows} rows`, cls: "text-slate-600 dark:text-slate-300" },
            { key: "matched", label: `${result.matched} matched`, cls: "text-emerald-700 dark:text-emerald-400" },
            {
              key: "created",
              label: `${result.created} created ${result.historicalImport ? "(historical)" : "(missing entry)"}`,
              cls: result.historicalImport ? "text-slate-600 dark:text-slate-300" : "text-red-700 dark:text-red-400",
            },
            { key: "ambiguous", label: `${result.ambiguous} ambiguous`, cls: "text-amber-700 dark:text-amber-400" },
            { key: "conflict", label: `${result.conflict} conflict`, cls: "text-red-700 dark:text-red-400" },
            { key: "skipped", label: `${result.skipped} skipped`, cls: "text-slate-500 dark:text-slate-400" },
          ] as { key: OutcomeFilter; label: string; cls: string }[]
        ).map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setOutcomeFilter(outcomeFilter === chip.key ? "all" : chip.key)}
            className={`rounded-full border px-2.5 py-1 font-medium transition ${chip.cls} ${
              outcomeFilter === chip.key
                ? "border-current bg-slate-100 dark:bg-slate-800"
                : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {chip.label}
          </button>
        ))}
        {discrepancyRowCount > 0 && (
          <span className="rounded-full px-2.5 py-1 font-medium text-orange-700 dark:text-orange-400">
            ⚠ {discrepancyRowCount} data entry mismatch{discrepancyRowCount === 1 ? "" : "es"}
          </span>
        )}
      </div>
      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by applicant name or ack number…"
          className="w-72 max-w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        {(outcomeFilter !== "all" || search) && (
          <button
            type="button"
            onClick={() => {
              setOutcomeFilter("all");
              setSearch("");
            }}
            className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Clear filter
          </button>
        )}
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Showing {visibleResults.length} of {result.totalRows}
        </span>
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Ambiguous and conflicting rows are never guessed — click into "Review" to open the
        application(s) in a new tab and resolve manually. A ⚠ row still matched and updated
        normally, but disagreed with what's already on file for one or more fields — these are
        also logged under Reports → Data Entry Accuracy for review.
        {allowConflictResolution && module === "PAN" && (
          <>
            {" "}A "conflict" row (existing application already has a different ack number) can
            also be created as its own new record — only do that once you've confirmed it's a
            genuine second/correction application, not a mistaken ack number on file.
          </>
        )}
      </p>
      <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 border-b border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
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
            {visibleResults.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-400 dark:text-slate-500">
                  No rows match this filter.
                </td>
              </tr>
            )}
            {visibleResults.map((r) => {
              const primaryId = r.panApplicationId ?? r.tanApplicationId;
              const ids = Array.from(new Set([primaryId, ...(r.candidateIds ?? [])].filter((v): v is number => v != null)));
              const resolvedId = resolvedRows[r.row];
              const canResolve =
                allowConflictResolution &&
                module === "PAN" &&
                r.outcome === "conflict" &&
                !resolvedId &&
                r.applicantName &&
                r.ackNumber;
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
                    {resolvedId && (
                      <span className="ml-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                        {ids.length > 0 && "· "}Created{" "}
                        <a href={`${basePath}/${resolvedId}`} target="_blank" rel="noreferrer" className="underline">
                          #{resolvedId}
                        </a>
                      </span>
                    )}
                    {canResolve && (
                      <div className="mt-1">
                        <button
                          type="button"
                          disabled={resolvingRow === r.row}
                          onClick={() => onCreateSeparate(r.row, r.applicantName!, r.ackNumber!, r.parsedRow)}
                          className="rounded border border-indigo-300 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                        >
                          {resolvingRow === r.row ? "Creating…" : "Create as separate application"}
                        </button>
                        {resolveErrors[r.row] && (
                          <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{resolveErrors[r.row]}</p>
                        )}
                      </div>
                    )}
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
