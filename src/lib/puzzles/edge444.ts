/**
 * Edge-pairing coordinate for phase 3 of the 4x4x4 scrambler.
 *
 * Phase 3 turns only <U, D, F, B, R2, L2, Uw2, Dw2, Rw2, Lw2, Fw2, Bw2>.
 * Those moves split the 24 wing slots into two classes (A and B, one slot of
 * each per edge) that never mix. Once phase 2 has left exactly one wing of
 * every edge in the A slots, the pairing state is the permutation
 * τ(k) = edge whose B slot holds the partner of the wing in edge k's A slot.
 * Paired means τ = identity. Outer moves conjugate τ and wide half turns
 * swap one A pair and one B pair, so τ stays even.
 *
 * The pruning table follows the structure of Chen Shuang's threephase
 * Edge3: the first four entries of τ (the M-slice edges) are reduced by the
 * 8 class-keeping symmetries (1,538 classes), the other eight are an even
 * permutation rank (20,160), and distances are stored mod 3 in 2 bits up to
 * depth MAX_DEPTH. Deeper states read as "more than MAX_DEPTH".
 */
import * as M from './cube444';
import { stickerPos, type Vec } from '../cube/nxn';

/** Phase-3 moves (internal 4x4 move indices). */
export const P3_MOVES = [0, 1, 2, 6, 7, 8, 9, 10, 11, 15, 16, 17, 4, 13, 19, 22, 25, 28, 31, 34];
const NM = P3_MOVES.length;
export const MAX_DEPTH = 9;
const N_REST = 20160;

/** τ index → Kociemba edge; the M-slice edges UF UB DF DB come first. */
export const ORDER = [1, 3, 5, 7, 0, 2, 4, 6, 8, 9, 10, 11];

export interface EdgeTables {
  /** Wing class of each slot (0 = A). */
  cls: Uint8Array;
  aSlot: Int8Array; // by Kociemba edge
  bSlot: Int8Array;
  pos: Int8Array; // Kociemba edge → τ index
  qA: Int8Array; // [k * 12 + i]
  qB: Int8Array;
  sym: Int8Array[];
  nsym: number;
  rep4: Int8Array;
  raw2sym: Int32Array;
  stab: number[][];
  prun: Uint32Array;
}

let T: EdgeTables | null = null;

const POP = new Uint8Array(4096);
for (let i = 1; i < 4096; i++) POP[i] = POP[i >> 1] + (i & 1);

/** Rank of an ordered choice of 4 distinct values from 0..11 (and its digit parity). */
function rank4(a: number, b: number, c: number, d: number): number {
  let used = 1 << a;
  const rb = b - POP[used & ((1 << b) - 1)];
  used |= 1 << b;
  const rc = c - POP[used & ((1 << c) - 1)];
  used |= 1 << c;
  const rd = d - POP[used & ((1 << d) - 1)];
  return ((a * 11 + rb) * 10 + rc) * 9 + rd;
}

function unrank4(r: number, out: Int8Array | number[], off = 0): void {
  const dd = r % 9;
  r = (r / 9) | 0;
  const cc = r % 10;
  r = (r / 10) | 0;
  const bb = r % 11;
  const aa = (r / 11) | 0;
  out[off] = aa;
  let used = 1 << aa;
  const digits = [bb, cc, dd];
  for (let j = 0; j < 3; j++) {
    let n = -1;
    let v = 0;
    for (; v < 12; v++) {
      if (used & (1 << v)) continue;
      if (++n === digits[j]) break;
    }
    out[off + 1 + j] = v;
    used |= 1 << v;
  }
}

/** Even-permutation rank of t[4..11] relative to the values not in t[0..3]. */
function restRank(t: ArrayLike<number>): number {
  const used = (1 << t[0]) | (1 << t[1]) | (1 << t[2]) | (1 << t[3]);
  let seen = 0;
  let idx = 0;
  for (let i = 4; i < 11; i++) {
    const v = t[i];
    const x = v - POP[used & ((1 << v) - 1)];
    const digit = x - POP[seen & ((1 << x) - 1)];
    seen |= 1 << x;
    idx = idx * (12 - i) + digit;
  }
  return idx >> 1;
}

/** Inverse of restRank for a fixed first four entries; τ must be even. */
function restUnrank(idx: number, t: Int8Array): void {
  const used = (1 << t[0]) | (1 << t[1]) | (1 << t[2]) | (1 << t[3]);
  const free: number[] = [];
  for (let v = 0; v < 12; v++) if (!(used & (1 << v))) free.push(v);
  // parity of the first four Lehmer digits
  let p = 0;
  {
    let u = 0;
    for (let i = 0; i < 4; i++) {
      p += t[i] - POP[u & ((1 << t[i]) - 1)];
      u |= 1 << t[i];
    }
  }
  const digits = new Array<number>(8);
  let x = idx;
  for (let i = 5; i >= 0; i--) {
    digits[i] = x % (8 - i);
    x = (x / (8 - i)) | 0;
  }
  let s = p;
  for (let i = 0; i < 6; i++) s += digits[i];
  digits[6] = s & 1; // makes the whole permutation even
  digits[7] = 0;
  for (let i = 0; i < 8; i++) t[4 + i] = free.splice(digits[i], 1)[0];
}

const NORMAL: Vec[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, -1],
];

/** The cube symmetries that map the phase-3 move set onto itself and keep wing classes. */
function classKeepingSymmetries(cls: Uint8Array, aSlot: Int8Array, pos: Int8Array): Int8Array[] {
  const g = M.geometry();
  const key = (v: number[]) => v.join(',');
  const stickerAt = new Map<string, number>();
  for (let f = 0; f < 6; f++) for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) stickerAt.set(key(stickerPos(4, f, r, c)), f * 16 + r * 4 + c);
  const slotOf = new Map<number, number>();
  g.wingStickers.forEach(([a, b], s) => {
    slotOf.set(a, s);
    slotOf.set(b, s);
  });
  const out: Int8Array[] = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms)
    for (let sg = 0; sg < 8; sg++) {
      const mat = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (j === p[i] ? ((sg >> i) & 1 ? -1 : 1) : 0)));
      const ap = (v: number[]) => [0, 1, 2].map((i) => mat[i][0] * v[0] + mat[i][1] * v[1] + mat[i][2] * v[2]);
      const det =
        mat[0][0] * (mat[1][1] * mat[2][2] - mat[1][2] * mat[2][1]) -
        mat[0][1] * (mat[1][0] * mat[2][2] - mat[1][2] * mat[2][0]) +
        mat[0][2] * (mat[1][0] * mat[2][1] - mat[1][1] * mat[2][0]);
      const faceOf = (v: number[]) => NORMAL.findIndex((n) => n[0] === v[0] && n[1] === v[1] && n[2] === v[2]);
      const mapMove = (m: number) => {
        const pow = det < 0 ? 2 - M.movePow(m) : M.movePow(m);
        return (M.isWide(m) ? 18 : 0) + faceOf(ap(NORMAL[M.moveFace(m)])) * 3 + pow;
      };
      if (!P3_MOVES.every((m) => P3_MOVES.includes(mapMove(m)))) continue;
      const pt = (i: number) => {
        const f = (i / 16) | 0;
        return stickerPos(4, f, ((i % 16) / 4) | 0, i % 4);
      };
      const ws = g.wingStickers.map(([a]) => slotOf.get(stickerAt.get(key(ap(pt(a))))!)!);
      if (!ws.every((t, s) => cls[t] === cls[s])) continue;
      const q = new Int8Array(12);
      for (let i = 0; i < 12; i++) q[i] = pos[ws[aSlot[ORDER[i]]] % 12];
      out.push(q);
    }
  // identity first
  out.sort((x, y) => (x.every((v, i) => v === i) ? -1 : y.every((v, i) => v === i) ? 1 : 0));
  return out;
}

export function edgeTables(): EdgeTables {
  if (T) return T;
  const g = M.geometry();
  // wing classes: orbits of the phase-3 moves
  const cls = new Uint8Array(24).fill(255);
  const queue = [0];
  cls[0] = 0;
  while (queue.length) {
    const s = queue.pop()!;
    for (const m of P3_MOVES) {
      const t = g.wingDest[m][s];
      if (cls[t] === 255) {
        cls[t] = 0;
        queue.push(t);
      }
    }
  }
  for (let s = 0; s < 24; s++) if (cls[s] === 255) cls[s] = 1;
  const aSlot = new Int8Array(12);
  const bSlot = new Int8Array(12);
  for (let e = 0; e < 12; e++) {
    if (cls[e] === cls[e + 12]) throw new Error('edge444: both wings of an edge share a class');
    aSlot[e] = cls[e] === 0 ? e : e + 12;
    bSlot[e] = cls[e] === 0 ? e + 12 : e;
  }
  const pos = new Int8Array(12);
  ORDER.forEach((e, k) => (pos[e] = k));
  const qA = new Int8Array(NM * 12);
  const qB = new Int8Array(NM * 12);
  P3_MOVES.forEach((m, k) => {
    for (let i = 0; i < 12; i++) {
      const e = ORDER[i];
      const da = g.wingDest[m][aSlot[e]];
      const db = g.wingDest[m][bSlot[e]];
      if (cls[da] !== 0 || cls[db] !== 1) throw new Error('edge444: a phase-3 move mixes classes');
      qA[k * 12 + i] = pos[da % 12];
      qB[k * 12 + i] = pos[db % 12];
    }
  });
  const sym = classKeepingSymmetries(cls, aSlot, pos);
  const NS = sym.length;
  const symInv = sym.map((p) => {
    const q = new Int8Array(12);
    for (let i = 0; i < 12; i++) q[p[i]] = i;
    return q;
  });
  // symmetry classes of the first four entries
  const tmp = new Int8Array(4);
  const img = new Int16Array(11880 * NS);
  for (let r = 0; r < 11880; r++) {
    unrank4(r, tmp);
    for (let s = 0; s < NS; s++) {
      const p = sym[s];
      const pi = symInv[s];
      img[r * NS + s] = rank4(p[tmp[pi[0]]], p[tmp[pi[1]]], p[tmp[pi[2]]], p[tmp[pi[3]]]);
    }
  }
  const classOfRep = new Map<number, number>();
  const reps: number[] = [];
  const raw2sym = new Int32Array(11880);
  for (let r = 0; r < 11880; r++) {
    let best = r;
    let bs = 0;
    for (let s = 1; s < NS; s++) {
      const v = img[r * NS + s];
      if (v < best) {
        best = v;
        bs = s;
      }
    }
    let c = classOfRep.get(best);
    if (c === undefined) {
      c = reps.length;
      classOfRep.set(best, c);
      reps.push(best);
    }
    raw2sym[r] = c * 8 + bs;
  }
  const nsym = reps.length;
  const rep4 = new Int8Array(nsym * 4);
  const stab: number[][] = [];
  for (let c = 0; c < nsym; c++) {
    unrank4(reps[c], rep4, c * 4);
    const st: number[] = [];
    for (let s = 1; s < NS; s++) if (img[reps[c] * NS + s] === reps[c]) st.push(s);
    stab.push(st);
  }
  T = { cls, aSlot, bSlot, pos, qA, qB, sym, nsym, rep4, raw2sym, stab, prun: new Uint32Array(0) };
  T.prun = buildPrun(T);
  return T;
}

/** Table index of τ (conjugated into its class representative). */
export function edgeIndex(t: ArrayLike<number>, T: EdgeTables, scratch: Int8Array): number {
  const rs = T.raw2sym[rank4(t[0], t[1], t[2], t[3])];
  const c = rs >> 3;
  const p = T.sym[rs & 7];
  for (let i = 0; i < 12; i++) scratch[p[i]] = p[t[i]];
  return c * N_REST + restRank(scratch);
}

export function prunValue(prun: Uint32Array, i: number): number {
  return (prun[i >> 4] >>> ((i & 15) << 1)) & 3;
}

function buildPrun(T: EdgeTables): Uint32Array {
  const total = T.nsym * N_REST;
  const prun = new Uint32Array(Math.ceil(total / 16)).fill(0xffffffff);
  const setv = (i: number, v: number) => {
    prun[i >> 4] ^= (3 ^ v) << ((i & 15) << 1);
  };
  const t = new Int8Array(12);
  const u = new Int8Array(12);
  const w = new Int8Array(12);
  const x = new Int8Array(12);
  const mark = (src: Int8Array, depth: number, frontier: Int32Array | null, fill: { n: number }): void => {
    const rs = T.raw2sym[rank4(src[0], src[1], src[2], src[3])];
    const c = rs >> 3;
    const p = T.sym[rs & 7];
    for (let i = 0; i < 12; i++) w[p[i]] = p[src[i]];
    const idx = c * N_REST + restRank(w);
    if (prunValue(prun, idx) !== 3) return;
    setv(idx, depth % 3);
    if (frontier) frontier[fill.n++] = idx;
    for (const z of T.stab[c]) {
      const q = T.sym[z];
      for (let i = 0; i < 12; i++) x[q[i]] = q[w[i]];
      const j = c * N_REST + restRank(x);
      if (prunValue(prun, j) === 3) setv(j, depth % 3);
    }
  };
  for (let i = 0; i < 12; i++) t[i] = i;
  let frontier = new Int32Array(16);
  const fill = { n: 0 };
  mark(t, 0, frontier, fill);
  let size = fill.n;
  for (let d = 0; d < MAX_DEPTH; d++) {
    const keep = d + 1 < MAX_DEPTH;
    // generous upper bound for the next frontier
    let next = keep ? new Int32Array(Math.max(64, size * 22)) : null;
    fill.n = 0;
    for (let f = 0; f < size; f++) {
      const idx = frontier[f];
      const c = (idx / N_REST) | 0;
      t[0] = T.rep4[c * 4];
      t[1] = T.rep4[c * 4 + 1];
      t[2] = T.rep4[c * 4 + 2];
      t[3] = T.rep4[c * 4 + 3];
      restUnrank(idx - c * N_REST, t);
      for (let k = 0; k < NM; k++) {
        const o = k * 12;
        for (let i = 0; i < 12; i++) u[T.qA[o + i]] = T.qB[o + t[i]];
        if (next && fill.n + 8 >= next.length) {
          const grown = new Int32Array(next.length * 2);
          grown.set(next);
          next = grown;
        }
        mark(u, d + 1, next, fill);
      }
    }
    if (!next) break;
    frontier = next;
    size = fill.n;
  }
  return prun;
}
