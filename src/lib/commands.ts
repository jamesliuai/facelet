/** Command palette registry. */
import { router } from './router.svelte';
import { sessions } from './store/sessions.svelte';
import { settings } from './store/settings.svelte';
import { ui } from './store/ui.svelte';
import { timer } from './timer/timer.svelte';
import { EVENTS, eventById } from './scramble/events';
import { toggleFullscreen } from './device';

export interface Command {
  id: string;
  title: string;
  group: string;
  hint?: string;
  keywords?: string;
  run: () => void | Promise<void>;
}

export async function setLastPenalty(p: number) {
  const last = sessions.solves[sessions.solves.length - 1];
  if (!last) return;
  await sessions.update(last.id, { penalty: p });
  ui.toast(p === 0 ? 'Marked OK' : p > 0 ? 'Marked +2' : 'Marked DNF');
}

export async function deleteLast() {
  const last = sessions.solves[sessions.solves.length - 1];
  if (!last) return;
  await sessions.removeSolves([last.id]);
  ui.toast('Solve deleted', { label: 'Undo', run: () => void sessions.undoDelete() });
}

export async function copyText(text: string, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    ui.toast(label);
  } catch {
    ui.toast('Clipboard unavailable');
  }
}

export function commands(): Command[] {
  const out: Command[] = [];
  const page = (route: Parameters<typeof router.go>[0], title: string, keywords = '') =>
    out.push({ id: 'go-' + route, title, group: 'Go to', keywords, run: () => router.go(route) });
  page('timer', 'Timer', 'home');
  page('cube', 'Virtual cube', 'simulator 3d');
  page('train', 'Algorithm trainer', 'pll oll f2l zbll');
  page('stats', 'Statistics', 'graph chart history');
  page('tools', 'Tools', 'scramble generator metronome');
  page('settings', 'Settings', 'preferences options');
  page('about', 'About Facelet', 'privacy help');

  for (const e of EVENTS) {
    out.push({
      id: 'ev-' + e.id,
      title: e.name,
      group: 'Switch event',
      hint: e.short,
      keywords: e.short + ' ' + e.id,
      run: async () => {
        await sessions.selectEvent(e.id);
        router.go('timer');
      },
    });
  }
  for (const s of sessions.sorted()) {
    out.push({
      id: 'ses-' + s.id,
      title: s.name,
      group: 'Open session',
      hint: eventById(s.event).short,
      run: async () => {
        await sessions.select(s.id);
        if (!s.event.startsWith('v')) router.go('timer');
      },
    });
  }
  const act = (id: string, title: string, run: Command['run'], hint = '', keywords = '') =>
    out.push({ id, title, group: 'Actions', hint, keywords, run });
  act('new-scramble', 'New scramble', () => timer.newScramble(), '→', 'next');
  act('copy-scramble', 'Copy scramble', () => copyText(timer.scramble, 'Scramble copied'));
  act('new-session', 'New session', () => sessions.create(sessions.current.event).then(() => ui.toast('Session created')));
  act('sessions', 'Manage sessions', () => void (ui.sessionsOpen = true), '', 'rename delete reorder merge');
  act('customize', 'Customize appearance', () => void (ui.customizeOpen = true), 'Alt P', 'theme colour color accent font palette dark light');
  act('fullscreen', 'Toggle full screen', () => void toggleFullscreen(), 'Alt F', 'fullscreen zen');
  act('inspection', `${settings.inspection ? 'Disable' : 'Enable'} WCA inspection`, () => void (settings.inspection = !settings.inspection), '', '15 seconds');
  act('focus', `${settings.focusMode ? 'Disable' : 'Enable'} focus mode`, () => void (settings.focusMode = !settings.focusMode), '', 'hide ui');
  act('theme', 'Toggle dark mode', () => void (settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'), '', 'theme light');
  act('preview', `${settings.showScrambleImage ? 'Hide' : 'Show'} scramble preview`, () => void (settings.showScrambleImage = !settings.showScrambleImage));
  act('sidebar', `${settings.showSidebar ? 'Hide' : 'Show'} session panel`, () => void (settings.showSidebar = !settings.showSidebar));
  act('typing', settings.inputMode === 'typing' ? 'Use keyboard timer' : 'Use typing (manual entry)', () => void (settings.inputMode = settings.inputMode === 'typing' ? 'timer' : 'typing'), '', 'stackmat input');
  act('ok', 'Last solve: no penalty', () => setLastPenalty(0), 'Alt 1');
  act('plus2', 'Last solve: +2', () => setLastPenalty(2000), 'Alt 2');
  act('dnf', 'Last solve: DNF', () => setLastPenalty(-1), 'Alt 3');
  act('delete-last', 'Delete last solve', deleteLast, 'Alt ⌫');
  act('shortcuts', 'Keyboard shortcuts', () => void (ui.shortcutsOpen = true), '?');
  act('export', 'Export backup', () => router.go('settings', { s: 'data' }), '', 'download json backup');
  act('import', 'Import data (Facelet or csTimer)', () => router.go('settings', { s: 'data' }), '', 'cstimer upload restore');
  for (const set of ['PLL', 'OLL', 'F2L', 'COLL', 'ZBLL', 'CMLL']) {
    out.push({ id: 'train-' + set, title: `Train ${set}`, group: 'Trainer', run: () => router.go('train', { set: set.toLowerCase() }) });
  }
  return out;
}

/** Subsequence fuzzy score; higher is better, -1 for no match. */
export function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct * 2 - (t.length - q.length) * 0.1 + (direct === 0 || t[direct - 1] === ' ' ? 100 : 0);
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 10 + streak * 5 + (found === 0 || t[found - 1] === ' ' ? 15 : 0) - (found - ti);
    ti = found + 1;
  }
  return score;
}
