/**
 * Virtual cube controller: animation queue, csTimer keymap, pointer turning
 * and camera orbit. Keeps a logical model (updated instantly, used for
 * timing and solved checks) and a visual model (updated when a turn's
 * animation completes).
 */
import { CubeModel } from './model';
import { Renderer, hexToRgb, type View } from './renderer';
import { parseAlg, resolve, type Move, type Token } from '../cube/alg';

/** csTimer virtual cube layout, by physical key (KeyboardEvent.code). */
export const KEYMAP: Record<string, string> = {
  KeyI: 'R', KeyK: "R'", KeyW: 'B', KeyO: "B'", KeyS: 'D', KeyL: "D'", KeyD: 'L', KeyE: "L'",
  KeyJ: 'U', KeyF: "U'", KeyH: 'F', KeyG: "F'", Semicolon: 'y', KeyA: "y'", KeyU: 'r', KeyR: "l'",
  KeyM: "r'", KeyV: 'l', KeyT: 'x', KeyY: 'x', KeyN: "x'", KeyB: "x'", Period: "M'", KeyX: "M'",
  Digit5: 'M', Digit6: 'M', Digit1: "S'", Digit2: 'E', Digit9: "E'", Digit0: 'S', KeyP: 'z', KeyQ: "z'",
  KeyZ: 'd', KeyC: "u'", Comma: 'u', Slash: "d'",
};
/** Same layout keyed by the produced character, for the "characters" mode. */
export const CHARMAP: Record<string, string> = Object.fromEntries(
  Object.entries(KEYMAP).map(([code, mv]) => {
    const ch = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : { Semicolon: ';', Period: '.', Comma: ',', Slash: '/' }[code]!;
    return [ch, mv];
  }),
);

export interface TurnEvent {
  move: Move;
  name: string;
  rotation: boolean;
  t: number;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** Notation for a resolved move (outer, wide, slice, rotation). */
export function moveName(m: Move, n: number): string {
  const suf = m.q === 1 ? '' : m.q === 2 ? '2' : "'";
  const inv = m.q === 1 ? "'" : m.q === 2 ? '2' : '';
  const pos = ['R', 'U', 'F'][m.axis];
  const neg = ['L', 'D', 'B'][m.axis];
  const rot = ['x', 'y', 'z'][m.axis];
  if (m.lo === 0 && m.hi === n - 1) return rot + suf;
  if (m.hi === n - 1) {
    const d = n - m.lo;
    return d === 1 ? pos + suf : (d === 2 ? '' : d) + pos + 'w' + suf;
  }
  if (m.lo === 0) {
    const d = m.hi + 1;
    return d === 1 ? neg + inv : (d === 2 ? '' : d) + neg + 'w' + inv;
  }
  // Every inner layer at once is M / E / S on any size (what resolve('M', n) produces), so it round-trips.
  if (n >= 3 && m.lo === 1 && m.hi === n - 2) return ['M', 'E', 'S'][m.axis] + (m.axis === 2 ? suf : inv);
  if (m.lo === m.hi) {
    const fromPos = n - m.lo;
    const fromNeg = m.lo + 1;
    return fromPos <= fromNeg ? fromPos + pos + suf : fromNeg + neg + inv;
  }
  return `${pos}[${m.lo}-${m.hi}]${suf}`;
}

export class VirtualCube {
  n: number;
  logic: CubeModel;
  visual: CubeModel;
  renderer: Renderer;
  view: View = { yaw: 0.62, pitch: 0.5 };
  turnMs = 110;
  colors: [number, number, number][] = [];
  stickerless = false;
  onTurn: (e: TurnEvent) => void = () => {};
  onTurnSettled: (() => void) | undefined;
  private anim: { move: Move; start: number; dur: number } | null = null;
  private queue: Move[] = [];
  private raf = 0;
  private drag: { x: number; y: number; mode: 'orbit' | 'turn'; hit?: ReturnType<Renderer['pick']>; done: boolean; yaw: number; pitch: number } | null = null;
  enabled = true;

  constructor(private canvas: HTMLCanvasElement, n = 3) {
    this.n = n;
    this.logic = new CubeModel(n);
    this.visual = new CubeModel(n);
    this.renderer = new Renderer(canvas);
  }

  setColors(hex: string[]) {
    this.colors = hex.map(hexToRgb);
    this.request();
  }

  setSize(n: number) {
    this.n = n;
    this.logic = new CubeModel(n);
    this.visual = new CubeModel(n);
    this.anim = null;
    this.queue = [];
    this.request();
  }

  reset() {
    this.logic.reset();
    this.visual.reset();
    this.anim = null;
    this.queue = [];
    this.request();
  }

  setFacelets(facelets: Uint8Array) {
    this.logic.setFacelets(facelets);
    this.visual.setFacelets(facelets);
    this.anim = null;
    this.queue = [];
    this.request();
  }

  /** Apply an algorithm instantly (scrambles, replays). */
  applyInstant(alg: string) {
    this.finish();
    for (const t of parseAlg(alg)) {
      const m = resolve(t, this.n);
      if (!m) continue;
      this.logic.apply(m);
      this.visual.apply(m);
    }
    this.request();
  }

  /** Queue a move with animation. */
  turn(m: Move, emit = true) {
    this.logic.apply(m);
    if (emit) {
      this.onTurn({ move: m, name: moveName(m, this.n), rotation: m.lo === 0 && m.hi === this.n - 1, t: performance.now() });
    }
    if (this.turnMs <= 0) {
      this.visual.apply(m);
      this.request();
      this.onTurnSettled?.();
      return;
    }
    this.queue.push(m);
    // Keep up with fast typing: complete everything but the newest turn.
    while (this.queue.length > 1 || (this.anim && this.queue.length)) {
      if (this.anim) {
        this.visual.apply(this.anim.move);
        this.anim = null;
      } else if (this.queue.length > 1) {
        this.visual.apply(this.queue.shift()!);
      }
    }
    this.request();
  }

  turnToken(t: Token, emit = true) {
    const m = resolve(t, this.n);
    if (m) this.turn(m, emit);
  }

  turnAlg(alg: string, emit = true) {
    for (const t of parseAlg(alg)) this.turnToken(t, emit);
  }

  private finish() {
    if (this.anim) this.visual.apply(this.anim.move);
    this.anim = null;
    for (const m of this.queue) this.visual.apply(m);
    this.queue = [];
  }

  /** Keyboard → move. Returns true if handled. */
  key(e: KeyboardEvent, mode: 'physical' | 'character'): boolean {
    if (!this.enabled || e.metaKey || e.ctrlKey || e.altKey) return false;
    const mv = mode === 'physical' ? KEYMAP[e.code] : CHARMAP[e.key.toLowerCase()];
    if (!mv) return false;
    if (e.repeat) return true;
    this.turnAlg(mv);
    return true;
  }

  request() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(t: number) {
    this.raf = 0;
    if (!this.anim && this.queue.length) {
      const move = this.queue.shift()!;
      const dur = this.turnMs * (move.q === 2 ? 1.35 : 1);
      this.anim = { move, start: t, dur };
    }
    let a = null as { move: Move; angle: number } | null;
    let settled = false;
    if (this.anim) {
      const p = Math.min(1, (t - this.anim.start) / this.anim.dur);
      const qs = this.anim.move.q === 3 ? -1 : this.anim.move.q;
      a = { move: this.anim.move, angle: -(Math.PI / 2) * qs * ease(p) };
      if (p >= 1) {
        this.visual.apply(this.anim.move);
        this.anim = null;
        a = null;
        settled = true;
      }
    }
    this.renderer.draw(this.visual, a, this.view, this.colors, this.stickerless);
    if (this.anim || this.queue.length) this.request();
    if (settled && !this.queue.length) this.onTurnSettled?.();
  }

  resize(w: number, h: number) {
    this.renderer.resize(w, h);
    this.request();
  }

  // ---------------------------------------------------------------- pointer

  pointerDown(x: number, y: number, orbitOnly = false) {
    if (!this.enabled) return;
    // Picking only uses the cube's fixed geometry, so it is valid mid-animation:
    // a quick second drag must turn a layer, not orbit the camera.
    const hit = orbitOnly ? null : this.renderer.pick(this.n, x, y);
    this.drag = { x, y, mode: hit ? 'turn' : 'orbit', hit, done: false, yaw: this.view.yaw, pitch: this.view.pitch };
  }

  pointerMove(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    const dx = x - d.x;
    const dy = y - d.y;
    if (d.mode === 'orbit') {
      this.view.yaw = d.yaw - dx * 0.0085;
      this.view.pitch = Math.max(-1.35, Math.min(1.35, d.pitch + dy * 0.0085));
      this.request();
      return;
    }
    if (d.done || Math.hypot(dx, dy) < 12 || !d.hit) return;
    d.done = true;
    const { p, axis, sign } = d.hit;
    const len = Math.hypot(dx, dy);
    const dir = [dx / len, dy / len];
    const origin = this.renderer.project(p);
    let best = { score: -2, u: 0, s: 1 };
    for (let u = 0; u < 3; u++) {
      if (u === axis) continue;
      for (const s of [1, -1]) {
        const q = p.slice();
        q[u] += 0.5 * s;
        const sp = this.renderer.project(q);
        const v = [sp[0] - origin[0], sp[1] - origin[1]];
        const l = Math.hypot(v[0], v[1]) || 1;
        const score = (v[0] * dir[0] + v[1] * dir[1]) / l;
        if (score > best.score) best = { score, u, s };
      }
    }
    // rotation axis r = normal × drag direction
    const nv = [0, 0, 0];
    nv[axis] = sign;
    const uv = [0, 0, 0];
    uv[best.u] = best.s;
    const r = [nv[1] * uv[2] - nv[2] * uv[1], nv[2] * uv[0] - nv[0] * uv[2], nv[0] * uv[1] - nv[1] * uv[0]];
    const rAxis = r.findIndex((v) => v !== 0) as 0 | 1 | 2;
    const rSign = r[rAxis];
    const layer = Math.max(0, Math.min(this.n - 1, Math.floor(p[rAxis] + this.n / 2)));
    this.turn({ axis: rAxis, lo: layer, hi: layer, q: rSign > 0 ? 3 : 1 });
  }

  pointerUp() {
    this.drag = null;
  }

  resetView() {
    this.view = { yaw: 0.62, pitch: 0.5 };
    this.request();
  }

  /** Rebuild GPU resources after the browser dropped the WebGL context (GPU reset, iOS backgrounding). */
  restore() {
    const { width, height, dark } = this.renderer;
    this.renderer = new Renderer(this.canvas);
    this.renderer.dark = dark;
    this.renderer.resize(width, height);
    this.request();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
