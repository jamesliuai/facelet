/** Timer controller: engine + scrambles + saving solves. Lives across page switches. */
import { TimerEngine, type Phase, type Result } from './engine';
import { settings } from '../store/settings.svelte';
import { sessions } from '../store/sessions.svelte';
import { nextScramble, scrambles as batch } from '../scramble/client';
import { ui } from '../store/ui.svelte';
import { alert, beep } from './audio';
import { formatSolve, parseTimeEntry } from '../stats/format';
import { haptic } from '../device';
import type { PbEvent } from '../stats/engine';

const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

class TimerStore {
  phase: Phase = $state('idle');
  /** Mirrors engine.inspecting reactively (the engine itself is plain). */
  inspecting = $state(false);
  now = $state(0);
  scramble = $state('');
  loading = $state(false);
  custom = $state(false);
  history: string[] = $state([]);
  histPos = $state(-1);
  lastSolveId: string | null = $state(null);
  lastResult: Result | null = $state(null);
  /** How many scrambles for Multi-BLD. */
  mbldCount = $state(2);
  /** PBs set by the most recent solve (labels), for highlighting. */
  lastPbs: string[] = $state([]);
  /** Polite screen-reader announcement of the last result. */
  announcement = $state('');
  readonly engine: TimerEngine;
  private raf = 0;
  private alerted = new Set<number>();
  private key = '';
  private reqId = 0;

  constructor() {
    this.engine = new TimerEngine(this.cfg());
    this.engine.onPhase = (p) => this.handlePhase(p);
    this.engine.onResult = (r) => void this.handleResult(r);
  }

  private cfg() {
    const ev = sessions.event;
    return {
      holdTime: settings.holdTime,
      inspection: settings.inspection && ev.inspection,
      inspectionMs: settings.inspectionTime * 1000,
      phases: Math.max(1, settings.phases),
    };
  }

  get active(): boolean {
    return this.phase === 'ready' || this.phase === 'running' || this.engine.inspecting;
  }

  // ---------------------------------------------------------------- scrambles

  /** Call whenever the session or scramble type may have changed. */
  sync() {
    const s = sessions.current;
    if (!s) return;
    const k = `${s.id}|${s.event}|${s.scrambleType}`;
    if (k === this.key) return;
    this.key = k;
    this.history = [];
    this.histPos = -1;
    void this.newScramble();
  }

  async newScramble() {
    const s = sessions.current;
    if (!s) return;
    const id = ++this.reqId;
    this.loading = true;
    this.custom = false;
    let scr: string;
    try {
      if (s.event === '333mbf') {
        const list = await batch('333mbf', 'wca', Math.max(2, this.mbldCount));
        scr = list.map((x, i) => `${i + 1}) ${x}`).join('\n');
      } else {
        scr = await nextScramble(s.event, s.scrambleType);
      }
    } catch (e) {
      scr = '';
      ui.toast('Could not generate a scramble');
    }
    if (id !== this.reqId) return;
    this.scramble = scr;
    this.history = [...this.history.slice(0, this.histPos + 1), scr].slice(-50);
    this.histPos = this.history.length - 1;
    this.loading = false;
  }

  prevScramble() {
    if (this.histPos <= 0) return;
    this.histPos--;
    this.scramble = this.history[this.histPos];
    this.custom = false;
  }

  nextScrambleOrNew() {
    if (this.histPos < this.history.length - 1) {
      this.histPos++;
      this.scramble = this.history[this.histPos];
    } else void this.newScramble();
  }

  setCustom(text: string) {
    this.scramble = text.trim();
    this.custom = true;
    this.history = [...this.history.slice(0, this.histPos + 1), this.scramble];
    this.histPos = this.history.length - 1;
  }

  // ---------------------------------------------------------------- input

  press(t: number, isSpace: boolean) {
    this.engine.configure(this.cfg());
    if (this.engine.phase === 'running' && settings.stopKey === 'space' && !isSpace) return;
    this.engine.press(t, isSpace);
    this.kick();
  }

  release(t: number) {
    this.engine.release(t);
    this.kick();
  }

  cancel() {
    const was = this.engine.phase;
    this.engine.cancel();
    this.inspecting = false;
    if (was === 'running') ui.toast('Solve cancelled');
  }

  /** The key or finger was lost (window blur, touch cancel): never leave the timer armed. */
  abortHold() {
    this.engine.abortHold();
  }

  private handlePhase(p: Phase) {
    const prev = this.phase;
    this.phase = p;
    this.inspecting = this.engine.inspecting;
    ui.timing = this.active;
    if (p === 'inspecting' && prev === 'armInspect') this.alerted.clear();
    if (p === 'ready' && settings.haptics) haptic(10);
    if (p === 'running' && settings.startSound) beep(1200, 60, 0.12);
  }

  private kick() {
    if (this.raf) return;
    const loop = () => {
      const t = performance.now();
      this.now = t;
      this.engine.tick(t);
      if (this.engine.inspecting) {
        const secs = this.engine.inspectionElapsed(t) / 1000;
        for (const mark of [8, 12]) {
          if (secs >= mark && !this.alerted.has(mark)) {
            this.alerted.add(mark);
            alert(settings.inspectionAlerts, mark);
          }
        }
      }
      const p = this.engine.phase;
      if (p === 'idle' || p === 'stopped') {
        this.raf = 0;
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private async handleResult(r: Result) {
    this.lastResult = r;
    this.now = performance.now();
    const scramble = this.scramble;
    // Show the next scramble straight away; saving happens in parallel.
    void this.newScramble();
    const { solve, pbs } = await sessions.add({
      time: r.time,
      penalty: r.penalty,
      scramble,
      ...(r.splits.length ? { splits: r.splits } : {}),
      ...(r.inspection != null ? { inspection: r.inspection } : {}),
    });
    this.afterSolve(solve.id, pbs);
  }

  private afterSolve(id: string, pbs: PbEvent[]) {
    this.lastSolveId = id;
    this.lastPbs = pbs.map((p) => p.label);
    const s = sessions.solves[sessions.solves.length - 1];
    if (s) this.announcement = formatSolve(s, settings.precision) + (pbs.length ? ', new best ' + pbs.map((p) => p.label).join(', ') : '');
    if (settings.celebrate && pbs.length) ui.celebrate(pbs);
    else if (settings.milestones && MILESTONES.includes(sessions.solves.length)) ui.milestone(sessions.solves.length);
  }

  /** Manual time entry. Returns false if the text could not be parsed. */
  async submitTyped(text: string): Promise<boolean> {
    const p = parseTimeEntry(text, settings.precision);
    if (!p) return false;
    const scramble = this.scramble;
    void this.newScramble();
    const { solve, pbs } = await sessions.add({ time: p.time, penalty: p.penalty, scramble });
    this.lastResult = { time: p.time, penalty: p.penalty, splits: [], inspection: null };
    this.afterSolve(solve.id, pbs);
    return true;
  }
}

export const timer = new TimerStore();
