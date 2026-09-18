import { create } from 'zustand';
import {
  detectLocale,
  loadTranslations,
  persistLocale,
  type Locale,
  type Translation,
} from '../i18n';

interface LocaleState {
  locale: Locale;
  t: Translation;
  setLocale: (locale: Locale) => Promise<void>;
}

export const useLocaleStore = create<LocaleState>(() => ({
  locale: 'en',
  t: {} as Translation,
  setLocale: async (locale) => {
    persistLocale(locale);
    const t = await loadTranslations(locale);
    useLocaleStore.setState({ locale, t });
  },
}));

export async function bootstrapLocaleStore(): Promise<void> {
  const locale = detectLocale();
  try {
    const t = await loadTranslations(locale);
    useLocaleStore.setState({ locale, t });
    return;
  } catch (err) {
    console.error('Failed to load locale', locale, err);
  }

  const t = await loadTranslations('en');
  useLocaleStore.setState({ locale: 'en', t });
}
