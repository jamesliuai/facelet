/**
 * Square-1 random-state scrambler (WCA 4b3d).
 *
 * A uniformly random state (any shape, any permutation, either middle
 * orientation, with "/" immediately possible) is solved in two phases:
 *   1. shape → cube shape: BFS over layer shapes (rotations are free),
 *   2. cube shape → solved: IDA* over corner/edge permutation + middle with
 *      shape-preserving "(x,y) /" macros and BFS pruning tables.
 * The scramble is the inverse of the solution.
 */
import { randInt, randPerm } from '../rand';
import { bfsTable, indexToPerm, permToIndex } from '../cube/coord';
import { type Sq1State, solvedSq1, slash, twist, canSlash, isCorner } from './sq1';

// ------------------------------------------------------------------ shapes

const rot12 = (m: number, k: number) => {
  k = ((k % 12) + 12) % 12;
  return ((m << k) | (m >>> (12 - k))) & 0xfff;
};
/** Bit i set when slot i starts a piece. */
function maskOf(layer: number[]): number {
  let m = 0;
  for (let i = 0; i < 12; i++) if (layer[i] !== layer[(i + 11) % 12]) m |= 1 << i;
  return m;
}
const minRot = (m: number) => {
  let best = m;
  for (let k = 1; k < 12; k++) best = Math.min(best, rot12(m, k));
  return best;
};
const slashable = (t: number, b: number) => (t & 1) !== 0 && (t & 64) !== 0 && (b & 1) !== 0 && (b & 64) !== 0;
function slashMasks(t: number, b: number): [number, number] {
  const nt = (t & 0x3f) | ((b & 0x3f) << 6);
  const nb = ((t >> 6) & 0x3f) | (b & 0xfc0);
  return [nt, nb];
}
// rotating a layer array by k (new[(i+k)%12] = old[i]) rotates its mask left by k
const SOLVED = solvedSq1();
const CUBE_TOP = minRot(maskOf(SOLVED.top));
const CUBE_BOT = minRot(maskOf(SOLVED.bot));

let shapeDist: Map<number, number> | null = null;
const shapeKey = (t: number, b: number) => (minRot(t) << 12) | minRot(b);

function initShapes() {
  if (shapeDist) return;
  const dist = new Map<number, number>();
  const start = (CUBE_TOP << 12) | CUBE_BOT;
  dist.set(start, 0);
  let frontier = [start];
  let d = 0;
  while (frontier.length) {
    const next: number[] = [];
    for (const key of frontier) {
      const t0 = key >> 12;
      const b0 = key & 0xfff;
      for (let x = 0; x < 12; x++) {
        const t = rot12(t0, x);
        if ((t & 65) !== 65) continue;
        for (let y = 0; y < 12; y++) {
          const b = rot12(b0, y);
          if ((b & 65) !== 65) continue;
          const [nt, nb] = slashMasks(t, b);
          const k = shapeKey(nt, nb);
          if (!dist.has(k)) {
            dist.set(k, d + 1);
            next.push(k);
          }
        }
      }
    }
    frontier = next;
    d++;
  }
  shapeDist = dist;
}

// ------------------------------------------------------------------ phase 2 (cube shape)

// Canonical cube alignment = the solved alignment.
const TOP_C = [0, 3, 6, 9];
const TOP_E = [2, 5, 8, 11];
const BOT_C = [1, 4, 7, 10];
const BOT_E = [0, 3, 6, 9];
const CANON_T = maskOf(SOLVED.top);
const CANON_B = maskOf(SOLVED.bot);

/** Rotate each layer (by 0..2) back to the canonical pattern; returns the rotation used. */
function normalize(s: Sq1State): [Sq1State, number, number] {
  const t = maskOf(s.top);
  const b = maskOf(s.bot);
  let rx = -1;
  let ry = -1;
  for (let k = 0; k < 3 && rx < 0; k++) if (rot12(t, k) === CANON_T) rx = k;
  for (let k = 0; k < 3 && ry < 0; k++) if (rot12(b, k) === CANON_B) ry = k;
  if (rx < 0 || ry < 0) throw new Error('sq1: not cube shape');
  return [twist(s, rx, ry), rx, ry];
}

function encode(s: Sq1State): [number, number, number] {
  const corners = [...TOP_C.map((i) => s.top[i]), ...BOT_C.map((i) => s.bot[i])];
  const edges = [...TOP_E.map((i) => s.top[i]), ...BOT_E.map((i) => s.bot[i])];
  return [permToIndex(corners, 8), permToIndex(edges.map((e) => e - 8), 8), s.midFlipped ? 1 : 0];
}

function decode(c: number, e: number, m: number): Sq1State {
  const cp = indexToPerm(c, 8);
  const ep = indexToPerm(e, 8).map((x) => x + 8);
  const top = new Array<number>(12);
  const bot = new Array<number>(12);
  TOP_C.forEach((i, k) => (top[i] = top[i + 1] = cp[k]));
  BOT_C.forEach((i, k) => (bot[i] = bot[(i + 1) % 12] = cp[4 + k]));
  TOP_E.forEach((i, k) => (top[i] = ep[k]));
  BOT_E.forEach((i, k) => (bot[i] = ep[4 + k]));
  return { top, bot, midFlipped: m === 1 };
}

interface Macro {
  /** twists and slashes, ending with the rotation that restores the canonical cube alignment */
  seq: (string | [number, number])[];
  slashes: number;
  cSrc: number[]; // new corner slot k takes old corner slot cSrc[k]
  eSrc: number[];
}

const isCubeShape = (st: Sq1State) => {
  const t = maskOf(st.top);
  const b = maskOf(st.bot);
  let a = false;
  let c = false;
  for (let k = 0; k < 3; k++) {
    if (rot12(t, k) === CANON_T) a = true;
    if (rot12(b, k) === CANON_B) c = true;
  }
  return a && c;
};
const parityOf = (p: number[]) => {
  let x = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) x ^= 1;
  return x;
};

let MACROS: Macro[] = [];
let prunC: Int8Array | null = null; // corner perm × positions of edges 8,9 × middle
let prunE: Int8Array | null = null; // edge perm × positions of corners 0,1 × middle
let cMove: Uint16Array | null = null;
let eMove: Uint16Array | null = null;
let cPosMove: Uint8Array | null = null; // slot of a single corner after a macro
let ePosMove: Uint8Array | null = null;
const PAIR = 56;
const pairIdx = (a: number, b: number) => a * 7 + (b > a ? b - 1 : b);

function initPhase2() {
  if (prunC) return;
  // a probe state with distinct ids reveals how each macro moves slots
  const probe = decode(0, 0, 0);
  const slotOfPiece = (s: Sq1State) => {
    const [c, e] = encode(s);
    return [indexToPerm(c, 8), indexToPerm(e, 8)];
  };
  const seen = new Set<string>();
  const add = (seq: (string | [number, number])[], end: Sq1State, slashes: number) => {
    const [norm, nx, ny] = normalize(end);
    const [cp, ep] = slotOfPiece(norm);
    const key = cp.join('') + '|' + ep.join('') + '|' + (slashes & 1);
    if (seen.has(key)) return false;
    seen.add(key);
    MACROS.push({ seq: [...seq, [nx, ny]], slashes, cSrc: cp, eSrc: ep });
    return true;
  };
  // single-slash macros that keep cube shape
  for (let x = 0; x < 12; x++) {
    for (let y = 0; y < 12; y++) {
      const r = twist(probe, x, y);
      if (!canSlash(r)) continue;
      const after = slash(r);
      if (isCubeShape(after)) add([[x, y], '/'], after, 1);
    }
  }
  const G = MACROS.length;
  cMove = new Uint16Array(40320 * G);
  eMove = new Uint16Array(40320 * G);
  for (let i = 0; i < 40320; i++) {
    const p = indexToPerm(i, 8);
    for (let g = 0; g < G; g++) {
      cMove[i * G + g] = permToIndex(MACROS[g].cSrc.map((s) => p[s]), 8);
      eMove[i * G + g] = permToIndex(MACROS[g].eSrc.map((s) => p[s]), 8);
    }
  }
  cPosMove = new Uint8Array(8 * G);
  ePosMove = new Uint8Array(8 * G);
  for (let g = 0; g < G; g++) {
    for (let k = 0; k < 8; k++) {
      cPosMove[MACROS[g].cSrc[k] * G + g] = k;
      ePosMove[MACROS[g].eSrc[k] * G + g] = k;
    }
  }
  // goals: solved turned by any multiple of 90° on each layer
  const goals: [number, number][] = [];
  const goalC: number[] = [];
  const goalE: number[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const st = twist(SOLVED, 3 * i, 3 * j);
    const [c, e] = encode(st);
    goals.push([c, e]);
    const cp = indexToPerm(c, 8);
    const ep = indexToPerm(e, 8);
    goalC.push((c * PAIR + pairIdx(ep.indexOf(0), ep.indexOf(1))) * 2);
    goalE.push((e * PAIR + pairIdx(cp.indexOf(0), cp.indexOf(1))) * 2);
  }
  const N = 40320 * PAIR * 2;
  // pair-of-pieces position moves, precomputed (no allocation in the BFS inner loop)
  const cPair = new Uint8Array(PAIR * G);
  const ePair = new Uint8Array(PAIR * G);
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
    if (a === b) continue;
    const p = pairIdx(a, b);
    for (let g = 0; g < G; g++) {
      cPair[p * G + g] = pairIdx(cPosMove[a * G + g], cPosMove[b * G + g]);
      ePair[p * G + g] = pairIdx(ePosMove[a * G + g], ePosMove[b * G + g]);
    }
  }
  const flip = Uint8Array.from(MACROS.map((m) => m.slashes & 1));
  const cm = cMove;
  const em = eMove;
  prunC = bfsTable(N, [...new Set(goalC)], G, (i, g) => {
    const q = i >> 1;
    const c = (q / PAIR) | 0;
    return (cm[c * G + g] * PAIR + ePair[(q - c * PAIR) * G + g]) * 2 + ((i & 1) ^ flip[g]);
  });
  prunE = bfsTable(N, [...new Set(goalE)], G, (i, g) => {
    const q = i >> 1;
    const e = (q / PAIR) | 0;
    return (em[e * G + g] * PAIR + cPair[(q - e * PAIR) * G + g]) * 2 + ((i & 1) ^ flip[g]);
  });
  goalSet = new Set(goals.map(([c, e]) => c * 40320 + e));
}
let goalSet = new Set<number>();

function phase2(start: Sq1State, maxDepth = 22, nodeCap = 4e6): number[] | null {
  initPhase2();
  const G = MACROS.length;
  const [c0, e0, m0] = encode(start);
  const cp0 = indexToPerm(c0, 8);
  const ep0 = indexToPerm(e0, 8);
  // tracked pieces' slots: edges 0,1 (ids 8,9) and corners 0,1
  const s0 = { c: c0, e: e0, m: m0, e8: ep0.indexOf(0), e9: ep0.indexOf(1), c0: cp0.indexOf(0), c1: cp0.indexOf(1) };
  const path: number[] = [];
  let nodes = 0;
  const h = (c: number, e: number, m: number, e8: number, e9: number, ca: number, cb: number) =>
    Math.max(prunC![(c * PAIR + pairIdx(e8, e9)) * 2 + m], prunE![(e * PAIR + pairIdx(ca, cb)) * 2 + m]);
  const dfs = (c: number, e: number, m: number, e8: number, e9: number, ca: number, cb: number, togo: number): boolean => {
    if (togo === 0) return m === 0 && goalSet.has(c * 40320 + e);
    if (++nodes > nodeCap) return false;
    for (let g = 0; g < G; g++) {
      const nc = cMove![c * G + g];
      const ne = eMove![e * G + g];
      const nm = m ^ (MACROS[g].slashes & 1);
      const n8 = ePosMove![e8 * G + g];
      const n9 = ePosMove![e9 * G + g];
      const na = cPosMove![ca * G + g];
      const nb = cPosMove![cb * G + g];
      const hh = h(nc, ne, nm, n8, n9, na, nb);
      if (hh < 0 || hh >= togo) continue;
      path.push(g);
      if (dfs(nc, ne, nm, n8, n9, na, nb, togo - 1)) return true;
      path.pop();
      if (nodes > nodeCap) return false;
    }
    return false;
  };
  const h0 = h(s0.c, s0.e, s0.m, s0.e8, s0.e9, s0.c0, s0.c1);
  if (h0 < 0) return null;
  for (let d = h0; d <= maxDepth; d++) {
    if (dfs(s0.c, s0.e, s0.m, s0.e8, s0.e9, s0.c0, s0.c1, d)) return path;
    if (nodes > nodeCap) return null;
  }
  return null;
}

// ------------------------------------------------------------------ random state

export function randomState(): Sq1State {
  for (;;) {
    const order = randPerm(16);
    const top: number[] = [];
    const bot: number[] = [];
    let i = 0;
    let filled = 0;
    while (filled < 12) {
      const p = order[i++];
      const size = isCorner(p) ? 2 : 1;
      if (filled + size > 12) break;
      for (let k = 0; k < size; k++) top.push(p);
      filled += size;
    }
    if (filled !== 12) continue;
    let bf = 0;
    for (; i < 16; i++) {
      const p = order[i];
      const size = isCorner(p) ? 2 : 1;
      for (let k = 0; k < size; k++) bot.push(p);
      bf += size;
    }
    if (bf !== 12) continue;
    // A state whose layers hold kt and kb pieces arises from kt·kb (ordering, rotation) pairs,
    // so accept with probability 36 / (kt·kb) (6·6 is the smallest product) for uniformity.
    const kt = new Set(top).size;
    const kb = new Set(bot).size;
    if (randInt(kt * kb) >= 36) continue;
    let s: Sq1State = { top, bot, midFlipped: randInt(2) === 1 };
    s = twist(s, randInt(12), randInt(12));
    if (!canSlash(s)) continue;
    return s;
  }
}

const fmt = (n: number) => {
  n = ((n % 12) + 12) % 12;
  return n > 6 ? n - 12 : n;
};

/** Solution as a list of [x, y] twists and slashes ('/'). */
function solve(s: Sq1State): (string | [number, number])[] {
  initShapes();
  for (let attempt = 0; attempt < 400; attempt++) {
    const out: (string | [number, number])[] = [];
    let cur = s;
    // Retries start with a few random slashes: this varies the parity of the cube-shape
    // entry state (states already near cube shape otherwise have no choice of path).
    const prefix = attempt === 0 ? 0 : 1 + (attempt > 6 ? 1 : 0) + (attempt > 20 ? 1 : 0);
    for (let k = 0; k < prefix; k++) {
      const legal: [number, number][] = [];
      for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) if (canSlash(twist(cur, x, y))) legal.push([x, y]);
      const [x, y] = legal[randInt(legal.length)];
      out.push([x, y], '/');
      cur = slash(twist(cur, x, y));
    }
    // phase 1: walk down the shape distance table, choosing randomly among the best moves
    for (let guard = 0; guard < 40; guard++) {
      const t = maskOf(cur.top);
      const b = maskOf(cur.bot);
      const d = shapeDist!.get(shapeKey(t, b));
      if (d === undefined) throw new Error('sq1: unknown shape');
      if (d === 0) break;
      const options: [number, number][] = [];
      for (let x = 0; x < 12; x++) {
        for (let y = 0; y < 12; y++) {
          const tt = rot12(t, x);
          const bb = rot12(b, y);
          if (!slashable(tt, bb)) continue;
          const [nt, nb] = slashMasks(tt, bb);
          if (shapeDist!.get(shapeKey(nt, nb)) === d - 1) options.push([x, y]);
        }
      }
      if (!options.length) throw new Error('sq1: phase 1 stuck');
      const [x, y] = attempt === 0 ? options[0] : options[randInt(options.length)];
      out.push([x, y], '/');
      cur = slash(twist(cur, x, y));
    }
    const [norm, rx, ry] = normalize(cur);
    out.push([rx, ry]);
    cur = norm;
    // shape-preserving moves keep cornerParity xor edgeParity: only even states are solvable here
    const [cc, ee] = encode(cur);
    if ((parityOf(indexToPerm(cc, 8)) ^ parityOf(indexToPerm(ee, 8))) !== 0) continue;
    const p2 = phase2(cur);
    if (!p2) continue;
    for (const g of p2) {
      for (const step of MACROS[g].seq) {
        if (typeof step === 'string') {
          out.push(step);
          cur = slash(cur);
        } else {
          out.push([step[0], step[1]]);
          cur = twist(cur, step[0], step[1]);
        }
      }
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const t = twist(cur, 3 * i, 3 * j);
      if (JSON.stringify(t) === JSON.stringify(SOLVED)) {
        out.push([3 * i, 3 * j]);
        return out;
      }
    }
    throw new Error('sq1: not solved');
  }
  throw new Error('sq1: no solution');
}

/** Merge consecutive twists, cancel "/ /", drop (0,0), and format in WCA notation. */
function format(seq: (string | [number, number])[]): string {
  let items: (string | [number, number])[] = seq.map((m) => (Array.isArray(m) ? [m[0], m[1]] : m));
  for (let changed = true; changed; ) {
    changed = false;
    const merged: (string | [number, number])[] = [];
    for (const m of items) {
      const last = merged[merged.length - 1];
      if (Array.isArray(m) && Array.isArray(last)) {
        last[0] = (last[0] + m[0]) % 12;
        last[1] = (last[1] + m[1]) % 12;
        changed = true;
      } else if (Array.isArray(m) && fmt(m[0]) === 0 && fmt(m[1]) === 0) {
        changed = true; // identity twist
      } else if (m === '/' && last === '/') {
        merged.pop(); // two slashes cancel
        changed = true;
      } else merged.push(m);
    }
    items = merged;
  }
  return items
    .map((m) => (m === '/' ? '/' : `(${fmt((m as number[])[0])},${fmt((m as number[])[1])})`))
    .join(' ');
}

function invert(seq: (string | [number, number])[]): (string | [number, number])[] {
  return seq
    .slice()
    .reverse()
    .map((m) => (m === '/' ? m : [-(m as number[])[0], -(m as number[])[1]] as [number, number]));
}

export function randomStateScramble(): string {
  const s = randomState();
  return format(invert(solve(s)));
}

/** For tests: the scramble of a given state. */
export function scrambleFor(s: Sq1State): string {
  return format(invert(solve(s)));
}
