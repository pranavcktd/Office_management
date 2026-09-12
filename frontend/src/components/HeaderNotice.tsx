import { useSiteContent } from "../hooks/useSiteContent";

export function HeaderNotice() {
  const content = useSiteContent();
  if (!content?.headerNotice) return null;

  return (
    <div className="shrink-0 border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-center text-xs font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-300">
      <p className="whitespace-pre-line">{content.headerNotice}</p>
    </div>
  );
}
