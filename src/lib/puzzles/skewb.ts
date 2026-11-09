/**
 * Skewb: sticker model, random-state scrambler and a cube-net layout for
 * images.
 *
 * Scrambles follow TNoodle: a uniformly random state that needs at least 7
 * moves (WCA 4b3), written as exactly 11 moves (generateExactly(state, 11)).
 *
 * The solver works in a frame fixed by the four "twist-only" corners
 * URF, ULB, DRB, DLF. WCA notation (12h) turns around DRB (R), ULB (U),
 * DLF (L) and DBL (B). A turn around DBL equals a turn around URF plus a
 * whole-puzzle rotation, so B moves re-label later moves; see toWca().
 */
import { randInt, shuffle } from '../rand';
import { bfsTable, indexToPerm, permToIndex } from '../cube/coord';
import { type V2, type V3, type StickerDef, centroid, dot, movePerm, norm, pieceMove, cross, applyPerm, rotate, len, sub } from './geom';

/** Face local (a right, b up) to 3D, matching the NxN net orientation. */
function toFace(face: number, a: number, b: number): V3 {
  switch (face) {
    case 0: return [a, 1, -b];
    case 1: return [1, b, -a];
    case 2: return [a, b, 1];
    case 3: return [a, -1, b];
    case 4: return [-1, b, a];
    default: return [-a, b, -1];
  }
}

const LOCAL: V2[][] = [
  [[0, 1], [1, 0], [0, -1], [-1, 0]],
  [[-1, 1], [0, 1], [-1, 0]],
  [[1, 1], [1, 0], [0, 1]],
  [[1, -1], [0, -1], [1, 0]],
  [[-1, -1], [-1, 0], [0, -1]],
];

export const STICKERS: (StickerDef & { local: V2[] })[] = [];
for (let f = 0; f < 6; f++) {
  for (const poly of LOCAL) {
    const p3 = poly.map(([a, b]) => toFace(f, a, b));
    STICKERS.push({ face: f, poly: p3, c: centroid(p3), local: poly });
  }
}

const CORNER: Record<string, V3> = {
  URF: [1, 1, 1], ULB: [-1, 1, -1], DRB: [1, -1, -1], DLF: [-1, -1, 1],
  UFL: [-1, 1, 1], UBR: [1, 1, -1], DFR: [1, -1, 1], DBL: [-1, -1, -1],
};

const ANG = (2 * Math.PI) / 3;
const permFor = (corner: string) => movePerm(STICKERS, { axis: norm(CORNER[corner]), depth: 0, angle: ANG });

/** Fixed-space WCA moves. */
const WCA_PERMS: Record<string, Int16Array> = {
  R: permFor('DRB'),
  U: permFor('ULB'),
  L: permFor('DLF'),
  B: permFor('DBL'),
};

export function solvedState(): Uint8Array {
  return Uint8Array.from(STICKERS.map((s) => s.face));
}

export function applyScramble(state: Uint8Array, scr: string): Uint8Array {
  let s = state;
  for (const tok of scr.trim().split(/\s+/)) {
    const m = /^([RULB])('?)$/.exec(tok);
    if (m) s = applyPerm(s, WCA_PERMS[m[1]], m[2] ? 2 : 1);
  }
  return s;
}

export function isSolvedState(s: Uint8Array): boolean {
  for (let f = 0; f < 6; f++) for (let k = 1; k < 5; k++) if (s[f * 5 + k] !== s[f * 5]) return false;
  return true;
}

// ------------------------------------------------------------------ solver

const MODEL_AXES = ['URF', 'ULB', 'DRB', 'DLF'];
const TETRAD_A = ['URF', 'ULB', 'DRB', 'DLF'];
const TETRAD_B = ['UFL', 'UBR', 'DFR', 'DBL'];

function cornerStickers(name: string): number[] {
  const v = norm(CORNER[name]);
  const ids = STICKERS.map((s, i) => [s, i] as const)
    .filter(([s]) => s.local.length === 3 && dot(norm(s.c), v) > 0.8)
    .map(([, i]) => i);
  const ref = norm(cross(v, [0, 1, 0]));
  const ref2 = cross(v, ref);
  ids.sort((a, b) => {
    const pa = STICKERS[a].c;
    const pb = STICKERS[b].c;
    return Math.atan2(dot(pa, ref2), dot(pa, ref)) - Math.atan2(dot(pb, ref2), dot(pb, ref));
  });
  return ids;
}

const centerPieces = [0, 1, 2, 3, 4, 5].map((f) => [f * 5]);
const aPieces = TETRAD_A.map(cornerStickers);
const bPieces = TETRAD_B.map(cornerStickers);

interface Tables {
  ctr: Uint16Array; // 720 x 8
  bp: Uint8Array; // 24 x 8
  ao: Uint8Array; // 81 x 8
  bo: Uint8Array; // 81 x 8
  p1: Int8Array; // ctr * 24 + bp
  p2: Int8Array; // ao * 81 + bo
  /** Reachable values of the independent parts, for exact uniform sampling. */
  reachC: number[];
  reachBA: number[]; // b * 81 + ao
  reachBO: number[];
}
let T: Tables | null = null;

function ori4(i: number): number[] {
  return [i % 3, ((i / 3) | 0) % 3, ((i / 9) | 0) % 3, ((i / 27) | 0) % 3];
}
const enc4 = (o: number[]) => o[0] + o[1] * 3 + o[2] * 9 + o[3] * 27;

function init(): Tables {
  if (T) return T;
  const perms: Int16Array[] = [];
  for (const ax of MODEL_AXES) {
    const p = permFor(ax);
    const p2 = new Int16Array(p.length);
    for (let i = 0; i < p.length; i++) p2[i] = p[p[i]];
    perms.push(p, p2);
  }
  const cm = perms.map((p) => pieceMove(p, centerPieces));
  const am = perms.map((p) => pieceMove(p, aPieces));
  const bm = perms.map((p) => pieceMove(p, bPieces));
  const ctr = new Uint16Array(720 * 8);
  for (let i = 0; i < 720; i++) {
    const perm = indexToPerm(i, 6);
    for (let m = 0; m < 8; m++) {
      const np = new Array<number>(6);
      for (let p = 0; p < 6; p++) np[cm[m].dest[p]] = perm[p];
      ctr[i * 8 + m] = permToIndex(np, 6);
    }
  }
  const bp = new Uint8Array(24 * 8);
  for (let i = 0; i < 24; i++) {
    const perm = indexToPerm(i, 4);
    for (let m = 0; m < 8; m++) {
      const np = new Array<number>(4);
      for (let p = 0; p < 4; p++) np[bm[m].dest[p]] = perm[p];
      bp[i * 8 + m] = permToIndex(np, 4);
    }
  }
  const mkOri = (mv: typeof am) => {
    const t = new Uint8Array(81 * 8);
    for (let i = 0; i < 81; i++) {
      const o = ori4(i);
      for (let m = 0; m < 8; m++) {
        const no = new Array<number>(4);
        for (let p = 0; p < 4; p++) no[mv[m].dest[p]] = (o[p] + mv[m].twist[p]) % 3;
        t[i * 8 + m] = enc4(no);
      }
    }
    return t;
  };
  const ao = mkOri(am);
  const bo = mkOri(bm);
  const p1 = bfsTable(720 * 24, 0, 8, (i, m) => ctr[((i / 24) | 0) * 8 + m] * 24 + bp[(i % 24) * 8 + m]);
  const p2 = bfsTable(81 * 81, 0, 8, (i, m) => ao[((i / 81) | 0) * 8 + m] * 81 + bo[(i % 81) * 8 + m]);
  // The reachable set is a product of three independent parts (centres;
  // free corners with the fixed corners' twists; free corners' twists), so a
  // uniform state is a uniform pick from each part's BFS-reachable set.
  const reach = (size: number, next: (i: number, m: number) => number) => {
    const d = bfsTable(size, 0, 8, next);
    const out: number[] = [];
    for (let i = 0; i < size; i++) if (d[i] >= 0) out.push(i);
    return out;
  };
  const reachC = reach(720, (i, m) => ctr[i * 8 + m]);
  const reachBA = reach(24 * 81, (i, m) => bp[((i / 81) | 0) * 8 + m] * 81 + ao[(i % 81) * 8 + m]);
  const reachBO = reach(81, (i, m) => bo[i * 8 + m]);
  T = { ctr, bp, ao, bo, p1, p2, reachC, reachBA, reachBO };
  return T;
}

interface SkState {
  c: number;
  b: number;
  ao: number;
  bo: number;
}

function step(s: SkState, m: number): SkState {
  const t = T!;
  return { c: t.ctr[s.c * 8 + m], b: t.bp[s.b * 8 + m], ao: t.ao[s.ao * 8 + m], bo: t.bo[s.bo * 8 + m] };
}

function h(s: SkState): number {
  const t = T!;
  return Math.max(t.p1[s.c * 24 + s.b], t.p2[s.ao * 81 + s.bo]);
}

/** Optimal solution as model moves (axis*2 + (0 cw | 1 ccw)). */
function solveModel(start: SkState): number[] {
  const path: number[] = [];
  const dfs = (s: SkState, togo: number, lastAxis: number): boolean => {
    if (togo === 0) return s.c === 0 && s.b === 0 && s.ao === 0 && s.bo === 0;
    for (let m = 0; m < 8; m++) {
      const ax = m >> 1;
      if (ax === lastAxis) continue;
      const n = step(s, m);
      if (h(n) >= togo) continue;
      path.push(m);
      if (dfs(n, togo - 1, ax)) return true;
      path.pop();
    }
    return false;
  };
  for (let d = h(start); d <= 20; d++) {
    if (dfs(start, d, -1)) return path;
  }
  throw new Error('skewb: unsolvable');
}

/** Convert model moves to WCA notation (fixed-space R U L B). */
export function toWca(moves: number[]): string {
  const axisUrf = norm(CORNER.URF);
  let rot = 0; // accumulated rotation about URF, in units of +120°
  const letterAt = (v: V3): string => {
    const options: [string, V3][] = [['U', CORNER.ULB], ['R', CORNER.DRB], ['L', CORNER.DLF]];
    for (const [l, c] of options) if (len(sub(v, c)) < 1e-6) return l;
    throw new Error('skewb: frame error');
  };
  const out: string[] = [];
  for (const m of moves) {
    const ax = MODEL_AXES[m >> 1];
    const prime = (m & 1) === 1;
    if (ax === 'URF') {
      out.push('B' + (prime ? "'" : ''));
      rot = (rot + (prime ? 2 : 1)) % 3;
    } else {
      const v = rotate(CORNER[ax], axisUrf, (rot * 2 * Math.PI) / 3).map((x) => Math.round(x)) as V3;
      out.push(letterAt(v) + (prime ? "'" : ''));
    }
  }
  return out.join(' ');
}

/** A uniformly random reachable state (3,149,280 in all). */
function randomModelState(): SkState {
  const t = init();
  const ba = t.reachBA[randInt(t.reachBA.length)];
  return { c: t.reachC[randInt(t.reachC.length)], b: (ba / 81) | 0, ao: ba % 81, bo: t.reachBO[randInt(t.reachBO.length)] };
}

/** TNoodle's fixed skewb scramble length. */
export const SCRAMBLE_LENGTH = 11;

/** A random solution of exactly `length` model moves, no axis twice in a row. */
function exactSolution(start: SkState, length: number): number[] | null {
  const path: number[] = [];
  const order = [0, 1, 2, 3, 4, 5, 6, 7];
  const dfs = (s: SkState, togo: number, lastAxis: number): boolean => {
    if (togo === 0) return s.c === 0 && s.b === 0 && s.ao === 0 && s.bo === 0;
    for (const m of shuffle(order.slice())) {
      const ax = m >> 1;
      if (ax === lastAxis) continue;
      const n = step(s, m);
      if (h(n) > togo - 1) continue;
      path.push(m);
      if (dfs(n, togo - 1, ax)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(start, length, -1) ? path : null;
}

/** A scramble and the optimal move count of its state. */
export function randomScrambleInfo(): { scramble: string; optimal: number } {
  init();
  for (;;) {
    const s = randomModelState();
    const opt = solveModel(s);
    if (opt.length < 7) continue;
    const sol = exactSolution(s, SCRAMBLE_LENGTH) ?? opt;
    const scr = sol.reverse().map((m) => m ^ 1);
    return { scramble: toWca(scr), optimal: opt.length };
  }
}

export function randomScramble(): string {
  return randomScrambleInfo().scramble;
}

/** For tests: model scramble + solution in WCA notation should solve. */
export function _testRoundTrip(): boolean {
  init();
  const s = randomModelState();
  const sol = solveModel(s);
  const scr = sol.slice().reverse().map((m) => m ^ 1);
  const st = applyScramble(solvedState(), toWca([...scr, ...sol]));
  return isSolvedState(st);
}

/** For tests: the size of the uniformly sampled state space. */
export function _stateCount(): number {
  const t = init();
  return t.reachC.length * t.reachBA.length * t.reachBO.length;
}

export function _testLength(): number {
  return solveModel(randomModelState()).length;
}
