import { useState } from "react";
import { api } from "../api/client";
import { useLanguage } from "../hooks/useLanguage";

interface Props {
  exportPath:
    | "/pan/export"
    | "/tan/export"
    | "/dispatch/export"
    | "/queries/export"
    | "/attendance/daily/export"
    | "/attendance/monthly/export"
    | "/reports/rejected/export"
    | "/reports/adjusted/export"
    | "/reports/credit-status/export"
    | "/reports/discrepancies/export"
    | "/reports/daily-activity/export";
  params: Record<string, string | undefined>;
}

function filenameFromDisposition(header: string | undefined, fallback: string): string {
  const match = header?.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? fallback;
}

export function ExportButtons({ exportPath, params }: Props) {
  const { t } = useLanguage();
  const [downloading, setDownloading] = useState<"xlsx" | "pdf" | null>(null);

  async function download(format: "xlsx" | "pdf") {
    setDownloading(format);
    try {
      const response = await api.get(exportPath, {
        params: { ...params, format },
        responseType: "blob",
      });
      const filename = filenameFromDisposition(
        response.headers["content-disposition"],
        `export.${format}`
      );
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  const buttonClass =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => download("xlsx")} disabled={downloading !== null} className={buttonClass}>
        {downloading === "xlsx" ? t("exporting") : t("export_xls")}
      </button>
      <button type="button" onClick={() => download("pdf")} disabled={downloading !== null} className={buttonClass}>
        {downloading === "pdf" ? t("exporting") : t("export_pdf")}
      </button>
    </div>
  );
}
