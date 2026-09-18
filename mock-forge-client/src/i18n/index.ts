import type { Locale, Translation } from './types';

export type { Locale, Translation } from './types';

const STORAGE_KEY = 'mockforge-locale';

const translationCache: Partial<Record<Locale, Translation>> = {};

export const LOCALES: { id: Locale; labelKey: 'portuguese' | 'english' }[] = [
  { id: 'pt', labelKey: 'portuguese' },
  { id: 'en', labelKey: 'english' },
];

export async function loadTranslations(locale: Locale): Promise<Translation> {
  const cached = translationCache[locale];
  if (cached) return cached;

  const translation = locale === 'pt'
    ? (await import('./pt')).pt
    : (await import('./en')).en;

  translationCache[locale] = translation;
  return translation;
}

export function getTranslations(locale: Locale): Translation {
  const cached = translationCache[locale];
  if (!cached) {
    throw new Error(`Translations for "${locale}" are not loaded yet.`);
  }
  return cached;
}

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    // ignore
  }

  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pt')) {
    return 'pt';
  }

  return 'en';
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}
