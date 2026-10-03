import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { getDict } from '../i18n/translations';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('cg_lang') || 'en');

  useEffect(() => {
    localStorage.setItem('cg_lang', lang);
    document.documentElement.lang = lang === 'mr' ? 'mr' : 'en';
  }, [lang]);

  const t = useMemo(() => getDict(lang), [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      toggle: () => setLang((l) => (l === 'en' ? 'mr' : 'en')),
    }),
    [lang, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
