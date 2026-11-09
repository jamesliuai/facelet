/**
 * Appearance: every colour in the UI is derived (in CSS, with color-mix) from
 * three inputs — a background, a foreground and an optional accent. Palettes
 * are just pairs of those, so presets, custom colours and light/dark all share
 * one code path, and the default stays pure monochrome.
 */

export interface Palette {
  id: string;
  name: string;
  /** [background, foreground] */
  light: [string, string];
  dark: [string, string];
}

export const PALETTES: Palette[] = [
  { id: 'mono', name: 'Mono', light: ['#ffffff', '#0a0a0a'], dark: ['#0a0a0a', '#f5f5f5'] },
  { id: 'paper', name: 'Paper', light: ['#f7f5f0', '#1f1c17'], dark: ['#161512', '#ebe6dc'] },
  { id: 'slate', name: 'Slate', light: ['#f6f8fa', '#101828'], dark: ['#0c111b', '#e4e9f1'] },
  { id: 'sage', name: 'Sage', light: ['#f5f7f4', '#17201a'], dark: ['#0e1310', '#e2eae3'] },
  { id: 'dusk', name: 'Dusk', light: ['#f7f6fa', '#1b1726'], dark: ['#121019', '#e8e4f0'] },
  { id: 'oled', name: 'Midnight', light: ['#ffffff', '#000000'], dark: ['#000000', '#ffffff'] },
];

export interface Accent {
  id: string; // '' = monochrome
  name: string;
}

export const ACCENTS: Accent[] = [
  { id: '', name: 'None' },
  { id: '#2f6fed', name: 'Blue' },
  { id: '#0e9f8e', name: 'Teal' },
  { id: '#1f9d55', name: 'Green' },
  { id: '#e8a317', name: 'Amber' },
  { id: '#ee6a2b', name: 'Orange' },
  { id: '#e5484d', name: 'Red' },
  { id: '#e0457b', name: 'Pink' },
  { id: '#7c5cff', name: 'Violet' },
];

/** Colours for the timer's hold / ready states (csTimer users expect red → green). */
export const CLASSIC_HOLD = '#e5484d';
export const CLASSIC_READY = '#22a35a';

export interface ThemeInput {
  dark: boolean;
  palette: string;
  customLight: [string, string];
  customDark: [string, string];
  accent: string;
}

export interface ResolvedTheme {
  dark: boolean;
  bg: string;
  fg: string;
  accent: string; // '' when monochrome
  accentFg: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function isHex(s: unknown): s is string {
  return typeof s === 'string' && HEX.test(s);
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function resolveTheme(t: ThemeInput): ResolvedTheme {
  let pair: [string, string];
  if (t.palette === 'custom') pair = t.dark ? t.customDark : t.customLight;
  else {
    const p = PALETTES.find((x) => x.id === t.palette) ?? PALETTES[0];
    pair = t.dark ? p.dark : p.light;
  }
  let [bg, fg] = pair;
  if (!isHex(bg) || !isHex(fg)) [bg, fg] = t.dark ? PALETTES[0].dark : PALETTES[0].light;
  const accent = isHex(t.accent) ? t.accent : '';
  // Text on the accent: whichever of white / near-black reads better.
  const accentFg = accent ? (contrast(accent, '#ffffff') >= contrast(accent, '#111111') ? '#ffffff' : '#111111') : bg;
  return { dark: t.dark, bg, fg, accent, accentFg };
}

const CACHE_KEY = 'facelet.theme';

/** Write the resolved colours onto <html>; cached so index.html can paint them before the app loads. */
/** sRGB mix, matching CSS color-mix(in srgb, a p%, b). */
export function mixHex(a: string, b: string, p: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  let out = '#';
  for (const i of [1, 3, 5]) out += Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, '0');
  return out;
}

/** The page colour behind floating panels (see --canvas in app.css). */
export function canvasOf(r: Pick<ResolvedTheme, 'dark' | 'bg' | 'fg'>): string {
  return r.dark ? r.bg : mixHex(r.fg, r.bg, 0.034);
}

export function applyTheme(r: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = r.dark ? 'dark' : 'light';
  root.style.setProperty('--bg-base', r.bg);
  root.style.setProperty('--fg-base', r.fg);
  if (r.accent) {
    root.style.setProperty('--accent', r.accent);
    root.style.setProperty('--accent-fg', r.accentFg);
    root.dataset.accent = 'on';
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-fg');
    delete root.dataset.accent;
  }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', canvasOf(r));
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(r));
  } catch {
    /* private mode */
  }
}

export const UI_FONTS: Record<string, string> = {
  geist: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  system: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  mono: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};
