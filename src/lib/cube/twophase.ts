/**
 * Kociemba two-phase solver for the 3x3x3, written for Facelet.
 *
 * Phase 1 brings the cube into G1 = <U, D, R2, L2, F2, B2> (all twists and
 * flips zero, the four E-slice edges inside the slice). Phase 2 solves within
 * G1. Both phases run IDA* over coordinate move tables with BFS pruning
 * tables. Tables take roughly half a second to build and run in a worker.
 */
import { MOVES, type Cubie, invertMoves } from './cubie';
import { bfsTable, combToIndex, indexToComb, indexToPerm, permToIndex } from './coord';

const N_TWIST = 2187;
const N_FLIP = 2048;
const N_SLICE = 495;
const N_PERM8 = 40320;
const N_SPERM = 24;

/** Phase-2 moves as indices into the 18-move list. */
const P2_MOVES = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];
const IS_P2 = new Uint8Array(18);
for (const m of P2_MOVES) IS_P2[m] = 1;

function getTwist(co: number[]): number {
  let t = 0;
  for (let i = 0; i < 7; i++) t = t * 3 + co[i];
  return t;
}
function setTwist(t: number): number[] {
  const co = new Array<number>(8);
  let s = 0;
  for (let i = 6; i >= 0; i--) {
    co[i] = t % 3;
    s += co[i];
    t = (t / 3) | 0;
  }
  co[7] = (3 - (s % 3)) % 3;
  return co;
}
function getFlip(eo: number[]): number {
  let f = 0;
  for (let i = 0; i < 11; i++) f = f * 2 + eo[i];
  return f;
}
function setFlip(f: number): number[] {
  const eo = new Array<number>(12);
  let s = 0;
  for (let i = 10; i >= 0; i--) {
    eo[i] = f & 1;
    s += eo[i];
    f >>= 1;
  }
  eo[11] = s & 1;
  return eo;
}
function getSlice(ep: number[]): number {
  return combToIndex(ep.map((e) => e >= 8), 12);
}
function setSlice(idx: number): number[] {
  const chosen = indexToComb(idx, 12, 4);
  const ep = new Array<number>(12);
  let s = 8;
  let o = 0;
  for (let i = 0; i < 12; i++) ep[i] = chosen[i] ? s++ : o++;
  return ep;
}

export class TwoPhase {
  private twistMove!: Uint16Array;
  private flipMove!: Uint16Array;
  private sliceMove!: Uint16Array;
  private cpermMove!: Uint16Array;
  private eperm8Move!: Uint16Array;
  private spermMove!: Uint8Array;
  private p1t!: Int8Array;
  private p1f!: Int8Array;
  private p2c!: Int8Array;
  private p2e!: Int8Array;
  private sliceSolved = 0;
  ready = false;

  // search state
  private moves = new Int8Array(40);
  private maxLen = 21;
  private cube!: Cubie;
  private deadline = 0;
  private nodes = 0;
  private timedOut = false;
  private p2Limit = 12;
  /** Axis (0 U/D, 1 R/L, 2 F/B) the first / last solution move may not use, or -1. */
  private firstBan = -1;
  private lastBan = -1;

  init(): void {
    if (this.ready) return;
    const M = MOVES;
    // ---- move tables
    this.twistMove = new Uint16Array(N_TWIST * 18);
    for (let t = 0; t < N_TWIST; t++) {
      const co = setTwist(t);
      for (let m = 0; m < 18; m++) {
        const mv = M[m];
        const n = new Array<number>(8);
        for (let i = 0; i < 8; i++) n[i] = (co[mv.cp[i]] + mv.co[i]) % 3;
        this.twistMove[t * 18 + m] = getTwist(n);
      }
    }
    this.flipMove = new Uint16Array(N_FLIP * 18);
    for (let f = 0; f < N_FLIP; f++) {
      const eo = setFlip(f);
      for (let m = 0; m < 18; m++) {
        const mv = M[m];
        const n = new Array<number>(12);
        for (let i = 0; i < 12; i++) n[i] = (eo[mv.ep[i]] + mv.eo[i]) & 1;
        this.flipMove[f * 18 + m] = getFlip(n);
      }
    }
    this.sliceMove = new Uint16Array(N_SLICE * 18);
    for (let s = 0; s < N_SLICE; s++) {
      const ep = setSlice(s);
      for (let m = 0; m < 18; m++) {
        const mv = M[m];
        const n = new Array<number>(12);
        for (let i = 0; i < 12; i++) n[i] = ep[mv.ep[i]];
        this.sliceMove[s * 18 + m] = getSlice(n);
      }
    }
    this.sliceSolved = getSlice([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    this.cpermMove = new Uint16Array(N_PERM8 * 18);
    const tmp = new Array<number>(12);
    for (let c = 0; c < N_PERM8; c++) {
      const cp = indexToPerm(c, 8);
      for (let m = 0; m < 18; m++) {
        const mv = M[m];
        for (let i = 0; i < 8; i++) tmp[i] = cp[mv.cp[i]];
        this.cpermMove[c * 18 + m] = permToIndex(tmp, 8);
      }
    }
    this.eperm8Move = new Uint16Array(N_PERM8 * 10);
    for (let e = 0; e < N_PERM8; e++) {
      const ep = indexToPerm(e, 8);
      for (let k = 0; k < 10; k++) {
        const mv = M[P2_MOVES[k]];
        for (let i = 0; i < 8; i++) tmp[i] = ep[mv.ep[i]];
        this.eperm8Move[e * 10 + k] = permToIndex(tmp, 8);
      }
    }
    this.spermMove = new Uint8Array(N_SPERM * 10);
    for (let s = 0; s < N_SPERM; s++) {
      const sp = indexToPerm(s, 4);
      const ep = [0, 1, 2, 3, 4, 5, 6, 7, sp[0] + 8, sp[1] + 8, sp[2] + 8, sp[3] + 8];
      for (let k = 0; k < 10; k++) {
        const mv = M[P2_MOVES[k]];
        for (let i = 0; i < 4; i++) tmp[i] = ep[mv.ep[i + 8]] - 8;
        this.spermMove[s * 10 + k] = permToIndex(tmp, 4);
      }
    }
    // ---- pruning tables
    const tw = this.twistMove;
    const fl = this.flipMove;
    const sl = this.sliceMove;
    const ss = this.sliceSolved;
    this.p1t = bfsTable(N_SLICE * N_TWIST, ss * N_TWIST, 18, (i, m) => {
      const s = (i / N_TWIST) | 0;
      const t = i - s * N_TWIST;
      return sl[s * 18 + m] * N_TWIST + tw[t * 18 + m];
    });
    this.p1f = bfsTable(N_SLICE * N_FLIP, ss * N_FLIP, 18, (i, m) => {
      const s = (i / N_FLIP) | 0;
      const f = i - s * N_FLIP;
      return sl[s * 18 + m] * N_FLIP + fl[f * 18 + m];
    });
    const cpm = this.cpermMove;
    const epm = this.eperm8Move;
    const spm = this.spermMove;
    this.p2c = bfsTable(N_PERM8 * N_SPERM, 0, 10, (i, k) => {
      const c = (i / N_SPERM) | 0;
      const s = i - c * N_SPERM;
      return cpm[c * 18 + P2_MOVES[k]] * N_SPERM + spm[s * 10 + k];
    });
    this.p2e = bfsTable(N_PERM8 * N_SPERM, 0, 10, (i, k) => {
      const e = (i / N_SPERM) | 0;
      const s = i - e * N_SPERM;
      return epm[e * 10 + k] * N_SPERM + spm[s * 10 + k];
    });
    this.ready = true;
  }

  /**
   * Find a solution of at most maxLength moves (move indices 0..17).
   * Returns null if none was found within the time limit.
   */
  solve(cube: Cubie, maxLength = 21, timeLimitMs = 2000, phase2Max = 10, restrict: AxisRestriction = {}): number[] | null {
    this.init();
    this.cube = cube;
    this.maxLen = maxLength;
    this.firstBan = restrict.firstAxis ?? -1;
    this.lastBan = restrict.lastAxis ?? -1;
    this.deadline = Date.now() + timeLimitMs;
    this.timedOut = false;
    this.nodes = 0;
    const twist = getTwist(cube.co);
    const flip = getFlip(cube.eo);
    const slice = getSlice(cube.ep);
    for (let d1 = 0; d1 <= maxLength; d1++) {
      // Kociemba's classic bound: short phase 2 searches, many phase 1 candidates.
      this.p2Limit = Math.min(maxLength - d1, phase2Max);
      if (this.search1(twist, flip, slice, d1, 0)) {
        return this.result;
      }
      if (this.timedOut) return null;
    }
    return null;
  }

  private result: number[] = [];

  private search1(twist: number, flip: number, slice: number, togo: number, n: number): boolean {
    if (togo === 0) {
      if (twist !== 0 || flip !== 0 || slice !== this.sliceSolved) return false;
      if (n > 0 && IS_P2[this.moves[n - 1]]) return false;
      return this.phase2(n);
    }
    if ((++this.nodes & 0x3fff) === 0 && Date.now() > this.deadline) {
      this.timedOut = true;
      return false;
    }
    const last = n > 0 ? (this.moves[n - 1] / 3) | 0 : -1;
    for (let m = 0; m < 18; m++) {
      const face = (m / 3) | 0;
      if (face === last || face + 3 === last) continue;
      if (n === 0 && face % 3 === this.firstBan) continue;
      const t = this.twistMove[twist * 18 + m];
      const f = this.flipMove[flip * 18 + m];
      const s = this.sliceMove[slice * 18 + m];
      const h1 = this.p1t[s * N_TWIST + t];
      if (h1 >= togo) continue;
      const h2 = this.p1f[s * N_FLIP + f];
      if (h2 >= togo) continue;
      this.moves[n] = m;
      if (this.search1(t, f, s, togo - 1, n + 1)) return true;
      if (this.timedOut) return false;
    }
    return false;
  }

  private phase2(n1: number): boolean {
    // Permutations after phase 1.
    let cp = this.cube.cp.slice();
    let ep = this.cube.ep.slice();
    for (let k = 0; k < n1; k++) {
      const mv = MOVES[this.moves[k]];
      const ncp = new Array<number>(8);
      const nep = new Array<number>(12);
      for (let i = 0; i < 8; i++) ncp[i] = cp[mv.cp[i]];
      for (let i = 0; i < 12; i++) nep[i] = ep[mv.ep[i]];
      cp = ncp;
      ep = nep;
    }
    const c = permToIndex(cp, 8);
    const e = permToIndex(ep, 8);
    const sp = [ep[8] - 8, ep[9] - 8, ep[10] - 8, ep[11] - 8];
    const s = permToIndex(sp, 4);
    const h = Math.max(this.p2c[c * N_SPERM + s], this.p2e[e * N_SPERM + s]);
    const limit = Math.min(this.maxLen - n1, this.p2Limit);
    for (let d2 = h; d2 <= limit; d2++) {
      if (this.search2(c, e, s, d2, n1)) {
        this.result = Array.from(this.moves.subarray(0, n1 + d2));
        return true;
      }
    }
    return false;
  }

  private search2(c: number, e: number, s: number, togo: number, n: number): boolean {
    if (togo === 0) return c === 0 && e === 0 && s === 0 && (n === 0 || this.lastBan < 0 || ((this.moves[n - 1] / 3) | 0) % 3 !== this.lastBan);
    const last = n > 0 ? (this.moves[n - 1] / 3) | 0 : -1;
    for (let k = 0; k < 10; k++) {
      const m = P2_MOVES[k];
      const face = (m / 3) | 0;
      if (face === last || face + 3 === last) continue;
      if (n === 0 && face % 3 === this.firstBan) continue;
      if (togo === 1 && face % 3 === this.lastBan) continue;
      const nc = this.cpermMove[c * 18 + m];
      const ns = this.spermMove[s * 10 + k];
      if (this.p2c[nc * N_SPERM + ns] >= togo) continue;
      const ne = this.eperm8Move[e * 10 + k];
      if (this.p2e[ne * N_SPERM + ns] >= togo) continue;
      this.moves[n] = m;
      if (this.search2(nc, ne, ns, togo - 1, n + 1)) return true;
    }
    return false;
  }
}

/** Axis restrictions for the ends of a solution: 0 = U/D, 1 = R/L, 2 = F/B. */
export interface AxisRestriction {
  firstAxis?: number;
  lastAxis?: number;
}

let shared: TwoPhase | null = null;
export function solver(): TwoPhase {
  if (!shared) shared = new TwoPhase();
  return shared;
}

/**
 * Solve `cube`, trying for a short solution first and relaxing the bound if
 * the search is slow. Always returns a valid solution.
 */
export function solveCube(cube: Cubie, target = 21, restrict: AxisRestriction = {}): number[] {
  const s = solver();
  for (const [len, ms, p2] of [[target, 1500, 10], [target + 1, 1500, 12], [target + 3, 4000, 14], [30, 30000, 18]] as const) {
    const r = s.solve(cube, len, ms, p2, restrict);
    if (r) return r;
  }
  throw new Error('two-phase: no solution found');
}

/**
 * Keep tightening the length bound until the time budget runs out. Used for
 * training states (last layer, F2L...) where shorter scrambles matter.
 */
export function solveShort(cube: Cubie, budgetMs = 150, start = 22): number[] {
  const s = solver();
  const end = Date.now() + budgetMs;
  let best = solveCube(cube, start);
  while (best.length > 0) {
    const left = end - Date.now();
    if (left <= 0) break;
    const r = s.solve(cube, best.length - 1, left, 18);
    if (!r) break;
    best = r;
  }
  return best;
}

/** A scramble (move indices) that produces `cube` from solved. */
export function scrambleFor(cube: Cubie, target = 21): number[] {
  return invertMoves(solveCube(cube, target));
}
