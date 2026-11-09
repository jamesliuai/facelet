/** Transient UI state: toasts, palette, focus mode, celebrations. */
import type { PbEvent } from '../stats/engine';

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  timeout: number;
}

let tid = 0;

class UiStore {
  toasts: Toast[] = $state([]);
  paletteOpen = $state(false);
  shortcutsOpen = $state(false);
  /** True while a solve is being timed (hides chrome in focus mode). */
  timing = $state(false);
  celebration: { id: number; pbs: PbEvent[]; milestone?: number } | null = $state(null);
  /** Any modal open: the timer must ignore the spacebar. */
  modalDepth = $state(0);
  /** Quick appearance panel. */
  customizeOpen = $state(false);
  /** Session manager. */
  sessionsOpen = $state(false);
  /** Session panel as a sheet (tablet and phone). */
  sheetOpen = $state(false);
  /** The resolved theme (settings.theme may be 'system'). Kept in sync by App. */
  dark = $state(false);

  toast(text: string, action?: Toast['action'], timeout = 3500) {
    const t: Toast = { id: ++tid, text, action, timeout };
    this.toasts = [...this.toasts.slice(-2), t];
    setTimeout(() => this.dismiss(t.id), timeout);
  }

  dismiss(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  celebrate(pbs: PbEvent[]) {
    if (pbs.length) this.celebration = { id: ++tid, pbs };
  }

  /** A round-number solve count: a quieter banner, no confetti. */
  milestone(n: number) {
    this.celebration = { id: ++tid, pbs: [], milestone: n };
  }
}

export const ui = new UiStore();

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** True when keyboard focus is in a text field (shortcuts should not fire). Sliders, toggles and colour wells don't count. */
export function typingInField(e?: Event): boolean {
  const el = (e?.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT') return TEXT_INPUTS.has((el as HTMLInputElement).type);
  return tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
