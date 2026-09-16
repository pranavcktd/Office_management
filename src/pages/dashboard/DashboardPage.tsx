import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useLanguage } from "../../hooks/useLanguage";
import {
  ATTENDANCE_STATUS_LABELS,
  QUERY_STATUS_LABELS,
  STATUS_LABELS,
} from "../../types";
import type { DashboardSummary } from "../../types";

function Stat({ label, value, accent, to }: { label: string; value: number; accent?: string; to?: string }) {
  const content = (
    <>
      <div className={`text-2xl font-semibold ${accent ?? "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </>
  );
  const className = "block rounded-lg bg-slate-50 p-3 text-center transition hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700";
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function Card({
  title,
  to,
  children,
}: {
  title: string;
  to: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h2>
        <Link to={to} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Open →
        </Link>
      </div>
      {children}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardSummary>("/dashboard")
      .then(({ data }) => setData(data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  if (error) {
    return (
      <div className="px-6 py-8">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      </div>
    );
  }
  if (!data) {
    return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("nav_dashboard")}</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {t("welcome_back", { name: user?.fullName ?? user?.agentName ?? "" })}
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Today's Activity — {data.today.date}
          </h2>
          <Link to="/reports?tab=daily-activity" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Full Report →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="New Entries" value={data.today.newEntries.total} accent="text-blue-700 dark:text-blue-400" />
          <Stat label="New Rejections" value={data.today.newRejections.total} accent="text-red-700 dark:text-red-400" />
          <Stat label="Adjustments Made" value={data.today.adjustmentsMade.total} accent="text-amber-700 dark:text-amber-400" />
          <Stat
            label="New Revenue"
            value={Math.round(data.today.revenue.newRevenue)}
            accent="text-emerald-700 dark:text-emerald-400"
          />
          <Stat
            label="Adjusted Revenue"
            value={Math.round(data.today.revenue.adjustedRevenue)}
            accent="text-amber-700 dark:text-amber-400"
          />
          <Stat
            label="Missing Entry Alerts"
            value={data.today.missingEntryAlerts.total}
            accent={data.today.missingEntryAlerts.total > 0 ? "text-red-700 dark:text-red-400" : undefined}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Card title="PAN Applications" to="/pan">
          <div className={`grid gap-2 ${data.pan.AGENT_DRAFT ? "grid-cols-5" : "grid-cols-4"}`}>
            {Boolean(data.pan.AGENT_DRAFT) && (
              <Stat
                label={STATUS_LABELS.AGENT_DRAFT}
                value={data.pan.AGENT_DRAFT ?? 0}
                accent="text-purple-700 dark:text-purple-400"
                to="/pan?status=AGENT_DRAFT"
              />
            )}
            <Stat label={STATUS_LABELS.UNDER_ENTRY} value={data.pan.UNDER_ENTRY ?? 0} to="/pan?status=UNDER_ENTRY" />
            <Stat
              label={STATUS_LABELS.ACK_GENERATED}
              value={data.pan.ACK_GENERATED ?? 0}
              accent="text-emerald-700 dark:text-emerald-400"
              to="/pan?status=ACK_GENERATED"
            />
            <Stat
              label={STATUS_LABELS.REJECTED}
              value={data.pan.REJECTED ?? 0}
              accent="text-red-700 dark:text-red-400"
              to="/pan?status=REJECTED"
            />
            <Stat
              label="Fee Credits"
              value={data.pan.feeCreditsAvailable}
              accent="text-amber-700 dark:text-amber-400"
              to="/pan?status=REJECTED"
            />
          </div>
        </Card>

        <Card title="TAN Applications" to="/tan">
          <div className={`grid gap-2 ${data.tan.AGENT_DRAFT ? "grid-cols-5" : "grid-cols-4"}`}>
            {Boolean(data.tan.AGENT_DRAFT) && (
              <Stat
                label={STATUS_LABELS.AGENT_DRAFT}
                value={data.tan.AGENT_DRAFT ?? 0}
                accent="text-purple-700 dark:text-purple-400"
                to="/tan?status=AGENT_DRAFT"
              />
            )}
            <Stat label={STATUS_LABELS.UNDER_ENTRY} value={data.tan.UNDER_ENTRY ?? 0} to="/tan?status=UNDER_ENTRY" />
            <Stat
              label={STATUS_LABELS.ACK_GENERATED}
              value={data.tan.ACK_GENERATED ?? 0}
              accent="text-emerald-700 dark:text-emerald-400"
              to="/tan?status=ACK_GENERATED"
            />
            <Stat
              label={STATUS_LABELS.REJECTED}
              value={data.tan.REJECTED ?? 0}
              accent="text-red-700 dark:text-red-400"
              to="/tan?status=REJECTED"
            />
            <Stat
              label="Fee Credits"
              value={data.tan.feeCreditsAvailable}
              accent="text-amber-700 dark:text-amber-400"
              to="/tan?status=REJECTED"
            />
          </div>
        </Card>

        <Card title="Client Queries" to="/queries">
          <div className="grid grid-cols-4 gap-2">
            <Stat
              label={QUERY_STATUS_LABELS.OPEN}
              value={data.queries.OPEN ?? 0}
              accent="text-blue-700 dark:text-blue-400"
              to="/queries?status=OPEN"
            />
            <Stat
              label={QUERY_STATUS_LABELS.IN_PROGRESS}
              value={data.queries.IN_PROGRESS ?? 0}
              accent="text-amber-700 dark:text-amber-400"
              to="/queries?status=IN_PROGRESS"
            />
            <Stat label={QUERY_STATUS_LABELS.RESOLVED} value={data.queries.RESOLVED ?? 0} to="/queries?status=RESOLVED" />
            <Stat label={QUERY_STATUS_LABELS.CLOSED} value={data.queries.CLOSED ?? 0} to="/queries?status=CLOSED" />
          </div>
        </Card>

        <Card title="Attendance — Today" to="/attendance">
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(ATTENDANCE_STATUS_LABELS) as Array<keyof typeof ATTENDANCE_STATUS_LABELS>).map(
              (s) => (
                <Stat key={s} label={ATTENDANCE_STATUS_LABELS[s]} value={data.attendanceToday[s] ?? 0} to="/attendance" />
              )
            )}
          </div>
        </Card>

        <Card title="Agents" to="/agents">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Active"
              value={data.agents.active}
              accent="text-emerald-700 dark:text-emerald-400"
              to="/agents?status=ACTIVE"
            />
            <Stat label="Inactive" value={data.agents.inactive} to="/agents?status=INACTIVE" />
          </div>
        </Card>
      </div>
    </div>
  );
}
