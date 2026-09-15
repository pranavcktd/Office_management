import { useLanguage } from "../hooks/useLanguage";

export function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={language === "en" ? "हिन्दी में बदलें" : "Switch to English"}
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {language === "en" ? "हिन्दी" : "English"}
    </button>
  );
}
