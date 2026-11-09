/** User preferences, persisted to localStorage (small and synchronous, so the theme never flashes). */

export type TimerUpdate = 'full' | 'tenths' | 'seconds' | 'hidden';
export type ThemePref = 'light' | 'dark' | 'system';
export type TimerFont = 'sans' | 'mono' | 'serif' | 'system' | 'lcd';
export type TimerColors = 'mono' | 'classic' | 'accent';
export type DockPanel = 'image' | 'solver' | 'graph';
export type SolverKind = 'cross' | 'xcross' | 'eoline' | 'roux' | '222';

export interface Settings {
  // timing
  holdTime: number; // ms the key must be held before the timer arms
  inspection: boolean;
  inspectionTime: number; // seconds
  inspectionAlerts: 'voice' | 'beep' | 'none';
  timerUpdate: TimerUpdate;
  precision: 2 | 3;
  phases: number; // multi-phase splits, 1 = off
  inputMode: 'timer' | 'typing';
  stopKey: 'any' | 'space';
  focusMode: boolean;
  confirmDelete: boolean;
  startSound: boolean;
  keepAwake: boolean;
  haptics: boolean;
  // appearance
  theme: ThemePref;
  palette: string; // palette id or 'custom'
  customLight: [string, string]; // [background, text]
  customDark: [string, string];
  accent: string; // '' = monochrome
  uiFont: 'geist' | 'system' | 'mono';
  headingFont: 'serif' | 'sans';
  timerFont: TimerFont;
  timerSize: number; // scale
  timerWeight: number;
  timerColors: TimerColors;
  smallDecimals: boolean; // decimals set smaller than the seconds, chronograph style
  spotlight: boolean; // soft light behind the time
  scrambleFont: 'mono' | 'sans';
  scrambleSize: number;
  // layout
  showScrambleImage: boolean;
  showSidebar: boolean;
  sidebarSide: 'left' | 'right';
  showDock: boolean;
  dockCollapsed: boolean;
  showLastSolveBar: boolean;
  stripStats: string[]; // averages shown under the time
  showPbHint: boolean;
  showToday: boolean;
  // statistics
  avgList: string[];
  listColumns: [string, string];
  trimPct: number;
  celebrate: boolean;
  celebrateMin: number; // minimum solves in session before PB celebrations
  milestones: boolean;
  reduceMotion: 'system' | 'on' | 'off';
  cubeColors: string[]; // U R F D L B
  // virtual cube
  vcSize: number;
  vcTurnMs: number;
  vcInspection: boolean;
  vcKeyMode: 'physical' | 'character';
  vcShowKeys: boolean;
  vcStickerless: boolean;
  vcMirrorHints: boolean;
  // trainer
  trainerFiller: boolean;
  trainerShowAlg: 'after' | 'never' | 'always';
  trainerHoldTime: number;
  trainerYellowTop: boolean;
  // misc
  lastSessionId: string;
  toolPanel: DockPanel;
  solverKind: SolverKind;
  crossColour: number; // -1 = all
  shortcutsHintSeen: boolean;
}

export const DEFAULT_COLORS = ['#ffffff', '#c8102e', '#009b48', '#ffd500', '#ff5800', '#0046ad'];

export const DEFAULTS: Settings = {
  holdTime: 300,
  inspection: false,
  inspectionTime: 15,
  inspectionAlerts: 'voice',
  timerUpdate: 'full',
  precision: 2,
  phases: 1,
  inputMode: 'timer',
  stopKey: 'any',
  focusMode: true,
  confirmDelete: true,
  startSound: false,
  keepAwake: true,
  haptics: true,
  theme: 'light',
  palette: 'mono',
  customLight: ['#ffffff', '#0a0a0a'],
  customDark: ['#0a0a0a', '#f5f5f5'],
  accent: '',
  uiFont: 'geist',
  headingFont: 'serif',
  timerFont: 'sans',
  timerSize: 1,
  timerWeight: 300,
  timerColors: 'mono',
  smallDecimals: true,
  spotlight: true,
  scrambleFont: 'mono',
  scrambleSize: 1,
  showScrambleImage: true,
  showSidebar: true,
  sidebarSide: 'left',
  showDock: true,
  dockCollapsed: false,
  showLastSolveBar: true,
  stripStats: ['ao5', 'ao12'],
  showPbHint: true,
  showToday: true,
  avgList: ['mo3', 'ao5', 'ao12', 'ao50', 'ao100', 'ao1000'],
  listColumns: ['ao5', 'ao12'],
  trimPct: 5,
  celebrate: true,
  celebrateMin: 5,
  milestones: true,
  reduceMotion: 'system',
  cubeColors: DEFAULT_COLORS.slice(),
  vcSize: 3,
  vcTurnMs: 110,
  vcInspection: false,
  vcKeyMode: 'physical',
  vcShowKeys: false,
  vcStickerless: false,
  vcMirrorHints: false,
  trainerFiller: true,
  trainerShowAlg: 'after',
  trainerHoldTime: 150,
  trainerYellowTop: true,
  lastSessionId: '',
  toolPanel: 'image',
  solverKind: 'cross',
  crossColour: -1,
  shortcutsHintSeen: false,
};

const KEY = 'facelet.settings';
const SOLVERS: SolverKind[] = ['cross', 'xcross', 'eoline', 'roux', '222'];
const HEX = /^#[0-9a-f]{6}$/i;

/** Bring settings saved by older versions (or edited by hand) back into shape. */
export function migrate(raw: Record<string, unknown>): Settings {
  const s = { ...structuredClone(DEFAULTS), ...raw } as Settings & Record<string, unknown>;
  // Older builds kept the solver kind in toolPanel.
  if (SOLVERS.includes(s.toolPanel as unknown as SolverKind)) {
    s.solverKind = s.toolPanel as unknown as SolverKind;
    s.toolPanel = 'solver';
  }
  if (!['image', 'solver', 'graph'].includes(s.toolPanel)) s.toolPanel = 'image';
  if (!SOLVERS.includes(s.solverKind)) s.solverKind = 'cross';
  if (!Array.isArray(s.cubeColors) || s.cubeColors.length !== 6 || !s.cubeColors.every((c) => HEX.test(c))) s.cubeColors = DEFAULT_COLORS.slice();
  for (const k of ['customLight', 'customDark'] as const) {
    const v = s[k];
    if (!Array.isArray(v) || v.length !== 2 || !v.every((c) => HEX.test(c))) s[k] = structuredClone(DEFAULTS[k]);
  }
  if (typeof s.accent !== 'string' || (s.accent && !HEX.test(s.accent))) s.accent = '';
  if (!Array.isArray(s.avgList)) s.avgList = DEFAULTS.avgList.slice();
  if (!Array.isArray(s.stripStats)) s.stripStats = DEFAULTS.stripStats.slice();
  if (!Array.isArray(s.listColumns) || s.listColumns.length !== 2) s.listColumns = [...DEFAULTS.listColumns];
  if (!['sans', 'mono', 'serif', 'system', 'lcd'].includes(s.timerFont)) s.timerFont = 'sans';
  if (s.headingFont !== 'sans') s.headingFont = 'serif';
  return s;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    /* corrupted: fall back to defaults */
  }
  return structuredClone(DEFAULTS);
}

export const settings: Settings = $state(load());

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingJson = '';

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!pendingJson) return;
  try {
    localStorage.setItem(KEY, pendingJson);
  } catch {
    /* quota or private mode */
  }
  pendingJson = '';
}

$effect.root(() => {
  $effect(() => {
    pendingJson = JSON.stringify(settings);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 150);
  });
});

if (typeof window !== 'undefined') {
  // Never lose a change made right before the tab closes.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

export function resetSettings(keys?: (keyof Settings)[]) {
  const d = structuredClone(DEFAULTS);
  for (const k of keys ?? (Object.keys(d) as (keyof Settings)[])) {
    if (k === 'lastSessionId') continue;
    (settings as any)[k] = (d as any)[k];
  }
}

export function prefersReducedMotion(): boolean {
  if (settings.reduceMotion === 'on') return true;
  if (settings.reduceMotion === 'off') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Keys that make up "appearance", for the quick-customise panel's reset. */
export const APPEARANCE_KEYS: (keyof Settings)[] = [
  'theme', 'palette', 'customLight', 'customDark', 'accent', 'uiFont', 'headingFont', 'timerFont', 'timerSize', 'timerWeight',
  'timerColors', 'smallDecimals', 'spotlight', 'scrambleFont', 'scrambleSize', 'sidebarSide', 'showSidebar', 'showDock', 'showLastSolveBar',
  'stripStats', 'showPbHint', 'showToday',
];
