import { useCallback } from 'react';
import { create } from 'zustand';
import { en } from './en';

export type Locale = 'it' | 'en';

export const LOCALE_STORAGE_KEY = 'terrain-o/locale/v1';

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'it';
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'it' || saved === 'en') return saved;
  } catch {
    // Private mode or blocked storage: fall through to the browser language.
  }
  const language = (navigator.language || 'it').toLowerCase();
  return language.startsWith('it') ? 'it' : 'en';
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: readInitialLocale(),
  setLocale: (locale) => {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Persisting the preference is best effort.
    }
    set({ locale });
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  },
  toggleLocale: () => get().setLocale(get().locale === 'it' ? 'en' : 'it'),
}));

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/**
 * Translate an Italian source string. Italian is the source of truth and the
 * default; English lives in a flat dictionary keyed by the same string, so a
 * missing translation degrades to readable Italian instead of a raw key.
 */
export function translate(locale: Locale, source: string, vars?: Record<string, string | number>): string {
  if (locale === 'it') return interpolate(source, vars);
  return interpolate(en[source] ?? source, vars);
}

export function useLocale(): Locale {
  return useLocaleStore((state) => state.locale);
}

export function useT() {
  const locale = useLocale();
  return useCallback(
    (source: string, vars?: Record<string, string | number>) => translate(locale, source, vars),
    [locale],
  );
}

/** Label of a cartographic type, translated without touching the model. */
export function typeLabel(locale: Locale, label: string): string {
  return translate(locale, label);
}

export function localeName(locale: Locale): string {
  return locale === 'it' ? 'Italiano' : 'English';
}
