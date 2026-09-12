import { useSiteContent } from "../hooks/useSiteContent";

export function SystemContactFooter() {
  const content = useSiteContent();

  if (!content) return null;
  const hasContact = Boolean(content.email || content.mobile);
  const hasNotice = Boolean(content.footerNotice);
  if (!hasContact && !hasNotice) return null;

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      {hasNotice && <p className="whitespace-pre-line">{content.footerNotice}</p>}
      {hasContact && (
        <p>
          Need help? Contact System Admin
          {content.email && (
            <>
              {" · "}
              <a href={`mailto:${content.email}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                {content.email}
              </a>
            </>
          )}
          {content.mobile && (
            <>
              {" · "}
              <a href={`tel:${content.mobile}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                {content.mobile}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
