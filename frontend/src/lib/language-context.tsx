import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { translate, type Lang } from './i18n';

const STORAGE_KEY = 'anees_lang';

type LanguageContextValue = {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' || stored === 'ar' ? stored : 'ar';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);
  const dir: 'ltr' | 'rtl' = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [lang, dir]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  }, [lang, setLang]);

  const t = useCallback((path: string, vars?: Record<string, string | number>) => translate(lang, path, vars), [lang]);

  return <LanguageContext.Provider value={{ lang, dir, setLang, toggleLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
