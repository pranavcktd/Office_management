import { useSiteContent } from "../hooks/useSiteContent";

export function SystemContactFooter() {
  const content = useSiteContent();
  if (!content?.footerNotice) return null;

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <p className="whitespace-pre-line">{content.footerNotice}</p>
    </div>
  );
}
