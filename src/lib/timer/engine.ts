/**
 * Timer state machine (pure, testable). Inputs are press/release with
 * high-resolution timestamps; outputs are phase changes and finished solves.
 *
 *  idle ──press──▶ holding ──(held ≥ holdTime)──▶ ready ──release──▶ running
 *   │                 └──release early──▶ idle (or back to inspection)
 *   └─(inspection on) press+release ──▶ inspecting ──press──▶ holding …
 *  running ──press──▶ (split …) stopped ──release──▶ idle
 */

export type Phase = 'idle' | 'armInspect' | 'inspecting' | 'holding' | 'ready' | 'running' | 'stopped';

export interface EngineConfig {
  holdTime: number;
  inspection: boolean;
  inspectionMs: number;
  phases: number;
}

export interface Result {
  time: number;
  penalty: number;
  splits: number[];
  inspection: number | null;
}

export class TimerEngine {
  phase: Phase = 'idle';
  holdStart = 0;
  inspectStart = 0;
  start = 0;
  end = 0;
  splits: number[] = [];
  private cfg: EngineConfig;
  private inspectionUsed: number | null = null;
  onResult: (r: Result) => void = () => {};
  onPhase: (p: Phase) => void = () => {};

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
  }

  configure(cfg: EngineConfig) {
    this.cfg = cfg;
  }

  private set(p: Phase) {
    this.phase = p;
    this.onPhase(p);
  }

  get inspecting(): boolean {
    return this.inspectStart > 0;
  }

  /** Penalty implied by inspection time used (Regulation A4d1/A4d2). */
  static inspectionPenalty(usedMs: number, limitMs = 15000): number {
    if (usedMs >= limitMs + 2000) return -1;
    if (usedMs >= limitMs) return 2000;
    return 0;
  }

  press(t: number, isSpace = true) {
    switch (this.phase) {
      case 'idle':
        if (!isSpace) return;
        if (this.cfg.inspection) this.set('armInspect');
        else {
          this.holdStart = t;
          this.set(this.cfg.holdTime <= 0 ? 'ready' : 'holding');
        }
        break;
      case 'inspecting':
        if (!isSpace) return;
        this.holdStart = t;
        this.set(this.cfg.holdTime <= 0 ? 'ready' : 'holding');
        break;
      case 'running':
        if (this.splits.length < this.cfg.phases - 1) {
          this.splits.push(t - this.start);
          return;
        }
        this.end = t;
        this.set('stopped');
        this.finish();
        break;
    }
  }

  release(t: number) {
    switch (this.phase) {
      case 'armInspect':
        this.inspectStart = t;
        this.set('inspecting');
        break;
      case 'holding':
        // Held long enough even if no frame promoted us to 'ready' (background tab, slow device).
        if (t - this.holdStart >= this.cfg.holdTime) this.begin(t);
        else this.set(this.inspectStart > 0 ? 'inspecting' : 'idle');
        break;
      case 'ready':
        this.begin(t);
        break;
      case 'stopped':
        this.set('idle');
        break;
    }
  }

  private begin(t: number) {
    this.inspectionUsed = this.inspectStart > 0 ? t - this.inspectStart : null;
    this.start = t;
    this.splits = [];
    this.set('running');
  }

  /** Call every frame; promotes holding → ready once the hold time has elapsed. */
  tick(t: number) {
    if (this.phase === 'holding' && t - this.holdStart >= this.cfg.holdTime) this.set('ready');
  }

  cancel() {
    this.inspectStart = 0;
    this.splits = [];
    this.set('idle');
  }

  /**
   * Drop a press that will never be released (window lost focus, touch
   * cancelled): back to inspection if it is running, otherwise idle.
   */
  abortHold() {
    if (this.phase === 'holding' || this.phase === 'ready') this.set(this.inspectStart > 0 ? 'inspecting' : 'idle');
    else if (this.phase === 'armInspect') this.set('idle');
    else if (this.phase === 'stopped') this.set('idle');
  }

  private finish() {
    const time = Math.round(this.end - this.start);
    const used = this.inspectionUsed;
    const penalty = used != null ? TimerEngine.inspectionPenalty(used, this.cfg.inspectionMs) : 0;
    const r: Result = { time, penalty, splits: this.splits.map((s) => Math.round(s)), inspection: used != null ? Math.round(used) : null };
    this.inspectStart = 0;
    this.inspectionUsed = null;
    this.onResult(r);
  }

  elapsed(now: number): number {
    if (this.phase === 'running') return now - this.start;
    if (this.phase === 'stopped') return this.end - this.start;
    return 0;
  }

  inspectionElapsed(now: number): number {
    return this.inspectStart > 0 ? now - this.inspectStart : 0;
  }
}
