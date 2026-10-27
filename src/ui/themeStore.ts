import { create } from 'zustand';

/**
 * Tema dell'interfaccia. Il valore predefinito resta scuro: Terrain / O è uno
 * strumento da campo e la mappa deve essere l'unica cosa illuminata sullo
 * schermo. Il tema chiaro è una scelta esplicita, non un rilevamento del
 * sistema operativo, così il foglio di lavoro non cambia sotto le mani.
 */
export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'terrain-o/ui-theme/v1';

export function readStoredTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'dark';
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  // The browser paints its own chrome (address bar, form controls, scrollbars)
  // from this meta tag and from color-scheme in tokens.css.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f7f9' : '#12161a');
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Applied at module load as well: main.tsx imports this before the first
// render, and index.html sets data-theme earlier still to avoid a flash.
const initialTheme = readStoredTheme();
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Blocked storage only costs the preference, never the session.
    }
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));
