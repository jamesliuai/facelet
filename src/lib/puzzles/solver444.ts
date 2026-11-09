/**
 * WCA random-state 4x4x4 scrambler. TNoodle uses Chen Shuang's threephase;
 * this is our own reduction solver with the same phase structure:
 *
 *   P1  all 36 moves            R/L centres onto the R/L axis (exact table)
 *   P2  28 moves keeping P1     U/D centres onto U/D and R/L centres into the
 *                               12 arrangements phase 3 can finish (exact
 *                               table), filtered like threephase's checkEdge:
 *                               one wing of every edge in each phase-3 wing
 *                               class, an even flip count and even wing parity
 *   P3  <U,D,F,B,R2,L2,Uw2,Dw2,Rw2,Lw2,Fw2,Bw2>
 *                               pair every edge, solve the centres, fix PLL
 *                               parity (exact centre table + the pairing table
 *                               of edge444.ts, IDA*)
 *   P4  the 3x3 two-phase solver on the reduced cube
 *
 * Up to 300 phase-1 solutions feed a deepening over phase 1 + 2 length that
 * collects the best phase-2 candidates; phase 3 is solved optimally for the
 * one with the lowest bound, falling back to a weighted search when a state
 * is unusually hard (heavy-tailed cost; at most a move or two longer).
 *
 * The solution is searched with all six wide turns, inverted, and written
 * with WCA's fixed-orientation set (U D L R F B Uw Rw Fw): a Dw/Lw/Bw becomes
 * Uw/Rw/Fw plus a tracked whole-cube rotation that relabels later moves.
 */
import * as M from './cube444';
import { edgeTables, edgeIndex, prunValue, P3_MOVES, MAX_DEPTH, ORDER, type EdgeTables } from './edge444';
import { binom, combToIndex, indexToComb } from '../cube/coord';
import { solver as twoPhase } from '../cube/twophase';

// ------------------------------------------------------------------ move rules

const FACE_SIDE = [1, 1, 1, -1, -1, -1];
/** 0 = outer +, 1 = outer −, 2 = wide +, 3 = wide − within an axis. */
const layerType = (m: number) => (FACE_SIDE[M.moveFace(m)] > 0 ? 0 : 1) + (M.isWide(m) ? 2 : 0);

/** allowed[(prev + 1) * 36 + next]: canonical order for commuting moves on one axis. */
const ALLOWED = (() => {
  const a = new Uint8Array(37 * 36);
  for (let p = -1; p < 36; p++)
    for (let n = 0; n < 36; n++) a[(p + 1) * 36 + n] = p < 0 || M.moveAxis(p) !== M.moveAxis(n) || layerType(n) > layerType(p) ? 1 : 0;
  return a;
})();
const allowed = (prev: number, next: number) => ALLOWED[(prev + 1) * 36 + next] === 1;

/** Moves that keep the R/L centres on the R/L faces. */
const P2_MOVES = [...Array.from({ length: 18 }, (_, i) => i), 21, 22, 23, 30, 31, 32, 19, 28, 25, 34];
const IN_P2 = new Uint8Array(36);
for (const m of P2_MOVES) IN_P2[m] = 1;
const IN_P3 = new Uint8Array(36);
for (const m of P3_MOVES) IN_P3[m] = 1;

// ------------------------------------------------------------------ tables

const UD8 = [0, 1, 2, 3, 12, 13, 14, 15];
const FB8 = [8, 9, 10, 11, 20, 21, 22, 23];
const RL8 = [4, 5, 6, 7, 16, 17, 18, 19];
const NON_RL = [0, 1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23];
const N1 = 735471;
const RL_GOAL_MASK = (0xf << 4) | (0xf << 16);

interface Tables {
  lut: Uint32Array; // [m * 768 + byte * 256 + v]
  lo: Int32Array;
  pc: Int8Array;
  hi: Int32Array;
  p1: Int8Array;
  ud16: Uint16Array; // [i * 28 + k]
  rl70: Uint8Array; // [i * 28 + k]
  p2: Int8Array; // ud16 * 70 + rl
  udGoal16: number;
  c3: Uint8Array; // [(axis * 70 + i) * 20 + k] for UD8, FB8, RL8
  p3c: Int8Array; // ((ud * 70 + fb) * 70 + rl) * 2 + b
  bflip: Uint8Array; // per phase-3 move index
  edge: EdgeTables;
}

let TB: Tables | null = null;

function axisMoveTable(slots: number[], moves: number[], k: number, out: Uint8Array | Uint16Array, offset: number): void {
  const g = M.geometry();
  const n = slots.length;
  const count = binom(n, k);
  for (let i = 0; i < count; i++) {
    const ch = indexToComb(i, n, k);
    for (let j = 0; j < moves.length; j++) {
      const d = g.centerDest[moves[j]];
      const nch = new Array<boolean>(n).fill(false);
      for (let s = 0; s < n; s++) {
        if (!ch[s]) continue;
        const to = slots.indexOf(d[slots[s]]);
        if (to < 0) throw new Error('solver444: move leaves the slot set');
        nch[to] = true;
      }
      out[offset + i * moves.length + j] = combToIndex(nch, n);
    }
  }
}

function bfs(size: number, starts: number[], nMoves: number, next: (i: number, k: number) => number): Int8Array {
  const dist = new Int8Array(size).fill(-1);
  let frontier = starts.slice();
  for (const s of starts) dist[s] = 0;
  for (let d = 0; frontier.length; d++) {
    const nxt: number[] = [];
    for (const x of frontier)
      for (let k = 0; k < nMoves; k++) {
        const y = next(x, k);
        if (dist[y] < 0) {
          dist[y] = d + 1;
          nxt.push(y);
        }
      }
    frontier = nxt;
  }
  return dist;
}

function tables(): Tables {
  if (TB) return TB;
  const g = M.geometry();
  // ---- phase 1: masks of R/L-coloured centre slots
  const lut = new Uint32Array(36 * 768);
  for (let m = 0; m < 36; m++)
    for (let b = 0; b < 3; b++)
      for (let v = 0; v < 256; v++) {
        let o = 0;
        for (let i = 0; i < 8; i++) if (v & (1 << i)) o |= 1 << g.centerDest[m][b * 8 + i];
        lut[m * 768 + b * 256 + v] = o >>> 0;
      }
  const lo = new Int32Array(4096);
  const pc = new Int8Array(4096);
  const hi = new Int32Array(9 * 4096);
  for (let v = 0; v < 4096; v++) {
    let k = 0;
    let s = 0;
    for (let p = 0; p < 12; p++)
      if (v & (1 << p)) {
        k++;
        s += binom(p, k);
      }
    lo[v] = s;
    pc[v] = k;
  }
  for (let k0 = 0; k0 <= 8; k0++)
    for (let v = 0; v < 4096; v++) {
      let k = k0;
      let s = 0;
      for (let p = 0; p < 12; p++)
        if (v & (1 << p)) {
          k++;
          s += binom(12 + p, k);
        }
      hi[k0 * 4096 + v] = s;
    }
  const rank = (x: number) => lo[x & 4095] + hi[pc[x & 4095] * 4096 + (x >>> 12)];
  const p1 = new Int8Array(N1).fill(-1);
  {
    let frontier = [RL_GOAL_MASK];
    p1[rank(RL_GOAL_MASK)] = 0;
    for (let d = 0; frontier.length; d++) {
      const nxt: number[] = [];
      for (const x of frontier)
        for (let m = 0; m < 36; m++) {
          const o = m * 768;
          const y = lut[o + (x & 255)] | lut[o + 256 + ((x >>> 8) & 255)] | lut[o + 512 + (x >>> 16)];
          const r = rank(y);
          if (p1[r] < 0) {
            p1[r] = d + 1;
            nxt.push(y);
          }
        }
      frontier = nxt;
    }
  }
  // ---- phase 3 centres (+ PLL parity bit); also yields the R/L good set
  const c3 = new Uint8Array(3 * 70 * 20);
  [UD8, FB8, RL8].forEach((slots, a) => axisMoveTable(slots, P3_MOVES, 4, c3, a * 70 * 20));
  const bflip = new Uint8Array(20);
  // every wide half turn swaps one pair of A wings and no corners
  P3_MOVES.forEach((m, k) => (bflip[k] = M.isWide(m) ? 1 : 0));
  const p3c = bfs(70 * 70 * 70 * 2, [0], 20, (x, k) => {
    const b = x & 1;
    const r = (x >> 1) % 70;
    const f = (((x >> 1) / 70) | 0) % 70;
    const u = ((x >> 1) / 4900) | 0;
    return ((c3[(0 * 70 + u) * 20 + k] * 70 + c3[(70 + f) * 20 + k]) * 70 + c3[(140 + r) * 20 + k]) * 2 + (b ^ bflip[k]);
  });
  const rlGood: number[] = [];
  for (let r = 0; r < 70; r++) if (p3c[r * 2] >= 0) rlGood.push(r);
  // ---- phase 2
  const ud16 = new Uint16Array(12870 * 28);
  axisMoveTable(NON_RL, P2_MOVES, 8, ud16, 0);
  const rl70 = new Uint8Array(70 * 28);
  axisMoveTable(RL8, P2_MOVES, 4, rl70, 0);
  const udGoal16 = combToIndex(NON_RL.map((s) => s < 4 || (s >= 12 && s < 16)), 16);
  const p2 = bfs(12870 * 70, rlGood.map((r) => udGoal16 * 70 + r), 28, (x, k) => {
    const u = (x / 70) | 0;
    return ud16[u * 28 + k] * 70 + rl70[(x - u * 70) * 28 + k];
  });
  TB = { lut, lo, pc, hi, p1, ud16, rl70, p2, udGoal16, c3, p3c, bflip, edge: edgeTables() };
  return TB;
}

/** Build every table now (the worker calls this on first use). */
export function init444(): void {
  tables();
  twoPhase().init();
}

// ------------------------------------------------------------------ helpers

function maskOf(ct: Int8Array): number {
  let x = 0;
  for (let c = 0; c < 24; c++) if (ct[c] === 1 || ct[c] === 4) x |= 1 << c;
  return x >>> 0;
}

function comb(slots: number[], ct: Int8Array, colors: number[]): number {
  return combToIndex(slots.map((s) => colors.includes(ct[s])), slots.length);
}

function wingParity(wp: Int8Array): number {
  let p = 0;
  const seen = new Uint8Array(24);
  for (let i = 0; i < 24; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = wp[j]) {
      seen[j] = 1;
      len++;
    }
    p ^= (len - 1) & 1;
  }
  return p;
}

function permParity12(p: Int8Array | number[]): number {
  let s = 0;
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (p[j] < p[i]) s ^= 1;
  return s;
}

/** Phase-2 edge filter: one wing of every edge in the A class, even flips, even wing parity. */
function edgesReady(wp: Int8Array, E: EdgeTables): boolean {
  let seen = 0;
  let flips = 0;
  for (let e = 0; e < 12; e++) {
    const p = wp[E.aSlot[e]];
    const bit = 1 << p % 12;
    if (seen & bit) return false;
    seen |= bit;
    if (E.cls[p] !== 0) flips++;
  }
  return (flips & 1) === 0 && wingParity(wp) === 0;
}

/** τ for a state that passes edgesReady. */
function tauOf(wp: Int8Array, E: EdgeTables): Int8Array {
  const where = new Int8Array(24);
  for (let s = 0; s < 24; s++) where[wp[s]] = s;
  const t = new Int8Array(12);
  for (let k = 0; k < 12; k++) {
    const p = wp[E.aSlot[ORDER[k]]];
    const partner = (p + 12) % 24;
    t[k] = E.pos[where[partner] % 12];
  }
  return t;
}

/** PLL-parity bit: corner parity XOR parity of the A-class wing permutation. */
function pllBit(s: M.State444, E: EdgeTables): number {
  const sig = new Int8Array(12);
  for (let e = 0; e < 12; e++) sig[e] = s.wp[E.aSlot[e]] % 12;
  let cp = 0;
  const c = s.corners.cp;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (c[j] < c[i]) cp ^= 1;
  return cp ^ permParity12(sig);
}

// ------------------------------------------------------------------ phase 3 search

function stepTau(t: Int8Array, k: number, E: EdgeTables, out: Int8Array): Int8Array {
  const o = k * 12;
  for (let i = 0; i < 12; i++) out[E.qA[o + i]] = E.qB[o + t[i]];
  return out;
}

/**
 * Distance of τ: exact up to MAX_DEPTH + 2 (one- and two-move lookahead into
 * the stored layers), otherwise the lower bound MAX_DEPTH + 3.
 */
function rootEdgeDepth(t0: Int8Array, T: Tables): number {
  const E = T.edge;
  const scratch = new Int8Array(12);
  let v = prunValue(E.prun, edgeIndex(t0, E, scratch));
  if (v === 3) {
    const a = new Int8Array(12);
    const b = new Int8Array(12);
    const near: Int8Array[] = [];
    for (let k = 0; k < 20; k++) {
      stepTau(t0, k, E, a);
      if (prunValue(E.prun, edgeIndex(a, E, scratch)) !== 3) return MAX_DEPTH + 1;
      near.push(a.slice());
    }
    for (const x of near)
      for (let k = 0; k < 20; k++) {
        stepTau(x, k, E, b);
        if (prunValue(E.prun, edgeIndex(b, E, scratch)) !== 3) return MAX_DEPTH + 2;
      }
    return MAX_DEPTH + 3;
  }
  let t = t0.slice();
  let d = 0;
  const u = new Int8Array(12);
  for (;;) {
    let isId = true;
    for (let i = 0; i < 12; i++) if (t[i] !== i) isId = false;
    if (isId) return d;
    if (d > MAX_DEPTH) throw new Error('solver444: edge table walk overran');
    const want = (v + 2) % 3;
    let found = false;
    for (let k = 0; k < 20 && !found; k++) {
      const o = k * 12;
      for (let i = 0; i < 12; i++) u[E.qA[o + i]] = E.qB[o + t[i]];
      const w = prunValue(E.prun, edgeIndex(u, E, scratch));
      if (w === want) {
        t = u.slice();
        v = w;
        d++;
        found = true;
      }
    }
    if (!found) throw new Error('solver444: broken edge table');
  }
}

/** Phase-3 move lists allowed after each previous move (index prev + 1). */
const P3_NEXT: Int8Array[] = Array.from({ length: 37 }, (_, i) => Int8Array.from(P3_MOVES.map((m, k) => (allowed(i - 1, m) ? k : -1)).filter((k) => k >= 0)));

class Phase3 {
  private path = new Int8Array(64);
  private tau: Int8Array[] = Array.from({ length: 65 }, () => new Int8Array(12));
  private w = new Int8Array(12);
  nodes = 0;
  limitNodes = Infinity;
  /** Heuristic weight: 1 is optimal IDA*, above 1 trades length for speed. */
  weight = 1;

  constructor(private T: Tables) {}

  /** One depth-limited pass at exactly `L` moves. */
  searchAt(t0: Int8Array, ci: number, b: number, de: number, prev: number, L: number, nodeBudget: number): number[] | null {
    this.tau[0].set(t0);
    this.nodes = 0;
    this.limitNodes = nodeBudget;
    const rl = ci % 70;
    const fb = ((ci / 70) | 0) % 70;
    const ud = (ci / 4900) | 0;
    if (this.dfs(0, ud, fb, rl, b, de, L, prev)) return Array.from(this.path.subarray(0, L), (k) => P3_MOVES[k]);
    return null;
  }

  private dfs(n: number, ud: number, fb: number, rl: number, b: number, de: number, togo: number, prev: number): boolean {
    if (togo === 0) return de === 0 && ud === 0 && fb === 0 && rl === 0 && b === 0;
    if (++this.nodes > this.limitNodes) return false;
    const lim = this.weight === 1 ? togo - 1 : Math.ceil((togo - 1) / this.weight);
    const T = this.T;
    const E = T.edge;
    const c3 = T.c3;
    const p3c = T.p3c;
    const qA = E.qA;
    const qB = E.qB;
    const raw2sym = E.raw2sym;
    const prun = E.prun;
    const t = this.tau[n];
    const u = this.tau[n + 1];
    const w = this.w;
    const next = P3_NEXT[prev + 1];
    for (let j = 0; j < next.length; j++) {
      const k = next[j];
      const nud = c3[ud * 20 + k];
      const nfb = c3[(70 + fb) * 20 + k];
      const nrl = c3[(140 + rl) * 20 + k];
      const nb = b ^ T.bflip[k];
      if (p3c[((nud * 70 + nfb) * 70 + nrl) * 2 + nb] > lim) continue;
      const o = k * 12;
      for (let i = 0; i < 12; i++) u[qA[o + i]] = qB[o + t[i]];
      // edge table lookup (inlined edgeIndex)
      const a0 = u[0];
      const a1 = u[1];
      const a2 = u[2];
      const a3 = u[3];
      let used = 1 << a0;
      const rb = a1 - POP12[used & ((1 << a1) - 1)];
      used |= 1 << a1;
      const rc = a2 - POP12[used & ((1 << a2) - 1)];
      used |= 1 << a2;
      const rd = a3 - POP12[used & ((1 << a3) - 1)];
      const rs = raw2sym[((a0 * 11 + rb) * 10 + rc) * 9 + rd];
      const p = E.sym[rs & 7];
      for (let i = 0; i < 12; i++) w[p[i]] = p[u[i]];
      const wu = (1 << w[0]) | (1 << w[1]) | (1 << w[2]) | (1 << w[3]);
      let seen = 0;
      let idx = 0;
      for (let i = 4; i < 11; i++) {
        const v = w[i];
        const x = v - POP12[wu & ((1 << v) - 1)];
        idx = idx * (12 - i) + x - POP12[seen & ((1 << x) - 1)];
        seen |= 1 << x;
      }
      const ti = (rs >> 3) * 20160 + (idx >> 1);
      const v = (prun[ti >> 4] >>> ((ti & 15) << 1)) & 3;
      let nde: number;
      if (v === 3) nde = de > MAX_DEPTH + 1 ? de - 1 : MAX_DEPTH + 1;
      else if (de > MAX_DEPTH) nde = MAX_DEPTH;
      else nde = de - 1 + ((v - de + 301) % 3);
      if (nde > lim) continue;
      this.path[n] = k;
      if (this.dfs(n + 1, nud, nfb, nrl, nb, nde, togo - 1, P3_MOVES[k])) return true;
      if (this.nodes > this.limitNodes) return false;
    }
    return false;
  }
}

const POP12 = new Uint8Array(4096);
for (let i = 1; i < 4096; i++) POP12[i] = POP12[i >> 1] + (i & 1);

// ------------------------------------------------------------------ phases 1 + 2

interface Candidate {
  moves: number[]; // phases 1 + 2
  state: M.State444;
  tau: Int8Array;
  ci: number;
  b: number;
  de: number;
  h3: number;
}

interface P2Start {
  p1: number[];
  s: M.State444;
  u0: number;
  r0: number;
  h2: number;
  prev: number;
}

/** Phase-2 move indices allowed after each previous move (index prev + 1). */
const P2_NEXT: Int8Array[] = Array.from({ length: 37 }, (_, i) => Int8Array.from(P2_MOVES.map((m, k) => (allowed(i - 1, m) ? k : -1)).filter((k) => k >= 0)));

class Phase12 {
  private T: Tables;
  private E: EdgeTables;
  private p1path = new Int8Array(20);
  private p2path = new Int8Array(30);
  private wings: Int8Array[] = Array.from({ length: 31 }, () => new Int8Array(24));
  private wingDest: Int8Array[] = P2_MOVES.map((m) => M.geometry().wingDest[m]);
  p1Solutions: number[][] = [];
  candidates: Candidate[] = [];
  nodes = 0;

  constructor() {
    this.T = tables();
    this.E = this.T.edge;
  }

  private rank1(x: number): number {
    const T = this.T;
    return T.lo[x & 4095] + T.hi[T.pc[x & 4095] * 4096 + (x >>> 12)];
  }

  private mv1(m: number, x: number): number {
    const l = this.T.lut;
    const o = m * 768;
    return l[o + (x & 255)] | l[o + 256 + ((x >>> 8) & 255)] | l[o + 512 + (x >>> 16)];
  }

  /** Phase-1 solutions with lengths in [h, h + extra], at most `max`. */
  phase1(start: M.State444, extra: number, max: number): number[][] {
    const x0 = maskOf(start.ct);
    const h = this.T.p1[this.rank1(x0)];
    this.p1Solutions = [];
    for (let L = h; L <= h + extra && this.p1Solutions.length < max; L++) this.dfs1(x0, L, 0, -1, max);
    return this.p1Solutions;
  }

  private dfs1(x: number, togo: number, n: number, prev: number, max: number): void {
    if (togo === 0) {
      if (x === RL_GOAL_MASK && (n === 0 || !IN_P2[prev])) this.p1Solutions.push(Array.from(this.p1path.subarray(0, n)));
      return;
    }
    for (let m = 0; m < 36; m++) {
      if (!allowed(prev, m)) continue;
      const y = this.mv1(m, x);
      if (this.T.p1[this.rank1(y)] >= togo) continue;
      this.p1path[n] = m;
      this.dfs1(y, togo - 1, n + 1, m, max);
      if (this.p1Solutions.length >= max) return;
    }
  }

  /** Start of a phase-2 search after one phase-1 solution. */
  prepare2(start: M.State444, p1: number[]): P2Start {
    const s = M.applyMoves444(start, p1);
    const u0 = comb(NON_RL, s.ct, [0, 3]);
    const r0 = comb(RL8, s.ct, [1]);
    return { p1, s, u0, r0, h2: this.T.p2[u0 * 70 + r0], prev: p1.length ? p1[p1.length - 1] : -1 };
  }

  /** Every phase-2 solution of exactly L moves that passes the edge filter. */
  pass2(st: P2Start, L: number, maxCandidates: number, budgetEnd: number): void {
    this.wings[0].set(st.s.wp);
    this.dfs2(st, st.u0, st.r0, L, 0, st.prev, maxCandidates, budgetEnd);
  }

  private dfs2(st: P2Start, u: number, r: number, togo: number, n: number, prev: number, max: number, budgetEnd: number): void {
    if (togo === 0) {
      if (n > 0 && IN_P3[prev]) return; // a shorter phase 2 already satisfies the goal
      if (!edgesReady(this.wings[n], this.E)) return;
      this.accept(st, n);
      return;
    }
    if (++this.nodes > budgetEnd) return;
    const T = this.T;
    const wingDest = this.wingDest;
    const next = P2_NEXT[prev + 1];
    const w0 = this.wings[n];
    const w1 = this.wings[n + 1];
    for (let j = 0; j < next.length; j++) {
      const k = next[j];
      const nu = T.ud16[u * 28 + k];
      const nr = T.rl70[r * 28 + k];
      if (T.p2[nu * 70 + nr] >= togo) continue;
      const wd = wingDest[k];
      for (let i = 0; i < 24; i++) w1[wd[i]] = w0[i];
      this.p2path[n] = P2_MOVES[k];
      this.dfs2(st, nu, nr, togo - 1, n + 1, P2_MOVES[k], max, budgetEnd);
      if (this.candidates.length >= max || this.nodes > budgetEnd) return;
    }
  }

  private accept(st: P2Start, n: number): void {
    const T = this.T;
    const p2 = Array.from(this.p2path.subarray(0, n));
    const moves = [...st.p1, ...p2];
    const state = M.applyMoves444(st.s, p2);
    const tau = tauOf(state.wp, this.E);
    const ud = comb(UD8, state.ct, [0]);
    const fb = comb(FB8, state.ct, [2]);
    const rl = comb(RL8, state.ct, [1]);
    const ci = (ud * 70 + fb) * 70 + rl;
    const b = pllBit(state, this.E);
    const hc = T.p3c[ci * 2 + b];
    if (hc < 0) throw new Error('solver444: phase 2 left an unsolvable phase 3');
    const de = rootEdgeDepth(tau, T);
    this.candidates.push({ moves, state, tau, ci, b, de, h3: Math.max(hc, de) });
  }
}


// ------------------------------------------------------------------ output

const ROT_MAT = {
  // x, y, z quarter turns (as StickerCube rotateQ) as integer matrices
  x: [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ],
  y: [
    [0, 0, -1],
    [0, 1, 0],
    [1, 0, 0],
  ],
  z: [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
  ],
};
type Mat3 = number[][];
const mul3 = (a: Mat3, b: Mat3): Mat3 => a.map((row, i) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const transpose = (a: Mat3): Mat3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[j][i]));
const apply3 = (a: Mat3, v: number[]) => [0, 1, 2].map((i) => a[i][0] * v[0] + a[i][1] * v[1] + a[i][2] * v[2]);
const NORMALS = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, -1],
];
const faceOfNormal = (v: number[]) => NORMALS.findIndex((n) => n[0] === v[0] && n[1] === v[1] && n[2] === v[2]);
const pow3 = (a: Mat3, k: number): Mat3 => {
  let r: Mat3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let i = 0; i < k; i++) r = mul3(r, a);
  return r;
};

interface OutMove {
  face: number;
  wide: boolean;
  q: number; // quarter turns clockwise, 1..3
}

/**
 * Rewrite a move sequence (internal indices, any wide turn) with only
 * U D L R F B Uw Rw Fw. The result equals the input up to a whole-cube
 * rotation, which a 4x4x4 without fixed centres cannot tell apart.
 */
export function toWcaMoves(seq: number[]): OutMove[] {
  let g: Mat3 = pow3(ROT_MAT.x, 0);
  const out: OutMove[] = [];
  for (const m of seq) {
    // N = g⁻¹ M g turns the face whose normal is g⁻¹·n
    let face = faceOfNormal(apply3(transpose(g), NORMALS[M.moveFace(m)]));
    const q = M.movePow(m) + 1;
    const wide = M.isWide(m);
    if (wide && face >= 3) {
      // Dw = y'·Uw, Lw = x'·Rw, Bw = z'·Fw (commuting)
      const rot = face === 3 ? ROT_MAT.y : face === 4 ? ROT_MAT.x : ROT_MAT.z;
      g = mul3(g, pow3(rot, (4 - q) % 4)); // rotation ' to the power q
      face -= 3;
    }
    push(out, { face, wide, q });
  }
  return out;
}

const AXIS_OF = [1, 0, 2, 1, 0, 2];

/** Append with merging of commuting same-axis moves. */
function push(out: OutMove[], mv: OutMove): void {
  for (let i = out.length - 1; i >= 0 && AXIS_OF[out[i].face] === AXIS_OF[mv.face]; i--) {
    if (out[i].face === mv.face && out[i].wide === mv.wide) {
      const q = (out[i].q + mv.q) % 4;
      if (q === 0) out.splice(i, 1);
      else out[i] = { ...out[i], q };
      return;
    }
  }
  out.push(mv);
}

export function outToString(seq: OutMove[]): string {
  return seq.map((m) => 'URFDLB'[m.face] + (m.wide ? 'w' : '') + ['', '', '2', "'"][m.q]).join(' ');
}

// ------------------------------------------------------------------ top level

export interface Solve444 {
  /** Internal move indices that solve the state. */
  solution: number[];
  phases: number[];
}

/** Search effort knobs (defaults are tuned for the scramble worker). */
export interface SolveOptions {
  p1Extra?: number;
  p1Max?: number;
  candidates?: number;
  p2Slack?: number;
  p2Nodes?: number;
  p3Cap?: number;
  p3Weight?: number;
  /** Weight of the first phase-3 round (tests use > 1 for speed). */
  weight?: number;
}

/** Timings (ms) and node counts of the last solve, for tests and tuning. */
export const stats = { t12: 0, t3: 0, t4: 0, nodes2: 0, nodes3: 0, cands: 0 };

/** Solve a 4x4x4 state (internal moves, may include Dw/Lw/Bw). */
export function solve444(start: M.State444, opts: SolveOptions = {}): Solve444 {
  const T = tables();
  const t0 = Date.now();
  const p12 = new Phase12();
  const want = opts.candidates ?? 24;
  // Many phase-1 solutions, then a global deepening over phase 1 + 2 length
  // (as threephase does): candidates come from many different phase-1 ends.
  const starts = p12
    .phase1(start, opts.p1Extra ?? 2, opts.p1Max ?? 300)
    .map((p1) => p12.prepare2(start, p1))
    .sort((a, b) => a.p1.length + a.h2 - (b.p1.length + b.h2));
  // Each start is searched only a few moves past its own lower bound: deeper
  // passes cost exponentially more than trying another phase-1 ending.
  const minT = starts[0].p1.length + starts[0].h2;
  const budget2 = opts.p2Nodes ?? 1_500_000;
  const enough = () => p12.candidates.length >= want || (p12.candidates.length > 0 && p12.nodes > budget2);
  for (let slack = opts.p2Slack ?? 2; !enough() && slack < 12; slack += 2) {
    const maxT = starts[starts.length - 1].p1.length + starts[starts.length - 1].h2 + slack;
    for (let total = minT; total <= maxT && !enough(); total++)
      for (const st of starts) {
        const L = total - st.p1.length;
        if (L < st.h2 || L - st.h2 > slack || L > 20) continue;
        p12.pass2(st, L, want, Infinity);
        if (enough()) break;
      }
    if (p12.candidates.length) break;
  }
  if (!p12.candidates.length) throw new Error('solver444: no phase-2 candidate');
  const t1 = Date.now();
  const cands = p12.candidates.slice().sort((a, b) => a.moves.length + a.h3 - (b.moves.length + b.h3));
  stats.cands = cands.length;
  stats.nodes2 = p12.nodes;
  // Optimal phase 3 for the best candidate. Its cost is heavy-tailed, so a
  // search that runs past the cap restarts with a weighted heuristic (a move
  // or two longer, far fewer nodes); the last round is exact and uncapped.
  const p3 = new Phase3(T);
  let spent = 0;
  let best: { moves: number[]; p3: number[] } | null = null as { moves: number[]; p3: number[] } | null;
  const cap = opts.p3Cap ?? 700_000;
  const c = cands[0];
  const prev = c.moves.length ? c.moves[c.moves.length - 1] : -1;
  const rounds: [number, number][] = [
    [opts.weight ?? 1, cap],
    [opts.p3Weight ?? 1.3, cap],
    [1.6, cap * 2],
    [1, Infinity],
  ];
  for (const [weight, limit] of rounds) {
    p3.weight = weight;
    let used = 0;
    for (let L = c.h3; !best && used <= limit && L <= 50; L++) {
      const r = p3.searchAt(c.tau, c.ci, c.b, c.de, prev, L, limit - used);
      used += p3.nodes;
      if (r) best = { moves: c.moves, p3: r };
    }
    spent += used;
    if (best) break;
  }
  if (!best) throw new Error('solver444: phase 3 failed');
  stats.nodes3 = spent;
  const t2 = Date.now();
  const reduced = M.applyMoves444(start, [...best.moves, ...best.p3]);
  const cube = M.reducedToCubie(reduced);
  if (!cube) throw new Error('solver444: reduction is not a valid 3x3 state');
  const tp = twoPhase();
  const s3 = tp.solve(cube, 21, 2000, 10) ?? tp.solve(cube, 24, 5000, 14);
  if (!s3) throw new Error('solver444: 3x3 stage failed');
  const t3 = Date.now();
  stats.t12 = t1 - t0;
  stats.t3 = t2 - t1;
  stats.t4 = t3 - t2;
  const n1 = best.moves.length;
  return { solution: [...best.moves, ...best.p3, ...s3], phases: [n1, best.p3.length, s3.length] };
}

/** WCA random-state 4x4x4 scramble for a given state. */
export function scrambleFor444(state: M.State444, opts: SolveOptions = {}): string {
  const { solution } = solve444(state, opts);
  const inv = solution
    .slice()
    .reverse()
    .map((m) => M.invMove(m));
  return outToString(toWcaMoves(inv));
}

export function randomScramble444(): string {
  return scrambleFor444(M.random444());
}
