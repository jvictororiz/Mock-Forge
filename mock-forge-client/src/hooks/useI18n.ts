import { useLocaleStore } from '../stores/localeStore';
import type { Locale } from '../i18n';

export function useI18n() {
  const locale = useLocaleStore((state) => state.locale);
  const t = useLocaleStore((state) => state.t);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return { locale, t, setLocale } satisfies {
    locale: Locale;
    t: typeof t;
    setLocale: (locale: Locale) => Promise<void>;
  };
}
