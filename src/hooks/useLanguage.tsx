import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TRANSLATIONS } from "../i18n/translations";
import type { TranslationKey } from "../i18n/translations";

export type Language = "en" | "hi";

const STORAGE_KEY = "language";

function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "hi") return saved;
  } catch {
    // localStorage unavailable — default to English.
  }
  return "en";
}

interface LanguageContextValue {
  language: Language;
  toggleLanguage: () => void;
  /** Looks up a key and substitutes any `{name}` placeholders from `params` (e.g.
   * t("page_of", { page: 2, total: 5 })). */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  const value = useMemo<LanguageContextValue>(() => {
    function toggleLanguage() {
      setLanguage((prev) => {
        const next = prev === "en" ? "hi" : "en";
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Nothing to persist to — the toggle still works for this session.
        }
        return next;
      });
    }
    function t(key: TranslationKey, params?: Record<string, string | number>): string {
      const template = TRANSLATIONS[key]?.[language] ?? TRANSLATIONS[key]?.en ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    }
    return { language, toggleLanguage, t };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
