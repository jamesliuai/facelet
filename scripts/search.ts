/**
 * Build-time algorithm search: IDA* over coordinate move tables with BFS
 * pattern databases, restricted to finger-friendly move groups.
 */
import * as C from '../src/lib/cube/cubie';
import { indexToPerm, permToIndex } from '../src/lib/cube/coord';

export type Gen = 'RU' | 'RUD' | 'RUF';
export const GEN_MOVES: Record<Gen, string[]> = {
  RU: ['R', 'R2', "R'", 'U', 'U2', "U'"],
  RUD: ['R', 'R2', "R'", 'U', 'U2', "U'", 'D', 'D2', "D'"],
  RUF: ['R', 'R2', "R'", 'U', 'U2', "U'", 'F', 'F2', "F'"],
};
export const GEN_CORNERS: Record<Gen, number[]> = {
  RU: [0, 1, 2, 3, 4, 7],
  RUD: [0, 1, 2, 3, 4, 5, 6, 7],
  RUF: [0, 1, 2, 3, 4, 5, 7],
};
export const GEN_EDGES: Record<Gen, number[]> = {
  RU: [0, 1, 2, 3, 4, 8, 11],
  RUD: [0, 1, 2, 3, 4, 5, 6, 7, 8, 11],
  RUF: [0, 1, 2, 3, 4, 5, 8, 9, 11],
};

const moveId = (n: string) => C.MOVE_NAMES.indexOf(n);

// ------------------------------------------------------------------ coordinates

/** Arrangement (and optionally orientation) of the pieces living in `pos`. */
export class SetCoord {
  m: number;
  nPerm: number;
  nOri: number;
  permMove: Uint32Array;
  oriMove: Uint32Array;
  constructor(public kind: 'c' | 'e', public pos: number[], public withOri: boolean, public moves: number[]) {
    this.m = pos.length;
    let f = 1;
    for (let i = 2; i <= this.m; i++) f *= i;
    this.nPerm = f;
    const base = kind === 'c' ? 3 : 2;
    this.nOri = withOri ? base ** (this.m - 1) : 1;
    const G = moves.length;
    this.permMove = new Uint32Array(this.nPerm * G);
    this.oriMove = new Uint32Array(this.nOri * G);
    const local = new Map(pos.map((p, i) => [p, i]));
    for (let g = 0; g < G; g++) {
      const mv = C.MOVES[moves[g]];
      const P = kind === 'c' ? mv.cp : mv.ep;
      const O = kind === 'c' ? mv.co : mv.eo;
      // position mapping: new[q] = old[P[q]]
      const src = pos.map((q) => {
        const l = local.get(P[q]);
        if (l === undefined) throw new Error('move leaves the position set');
        return l;
      });
      for (let p = 0; p < this.nPerm; p++) {
        const a = indexToPerm(p, this.m);
        const b = src.map((s) => a[s]);
        this.permMove[p * G + g] = permToIndex(b, this.m);
      }
      for (let o = 0; o < this.nOri; o++) {
        const a = this.decodeOri(o);
        const b = src.map((s, i) => (a[s] + O[pos[i]]) % base);
        this.oriMove[o * G + g] = this.encodeOri(b);
      }
    }
  }
  decodeOri(o: number): number[] {
    const base = this.kind === 'c' ? 3 : 2;
    const a = new Array<number>(this.m);
    let s = 0;
    for (let i = this.m - 2; i >= 0; i--) {
      a[i] = o % base;
      s += a[i];
      o = Math.floor(o / base);
    }
    a[this.m - 1] = (base - (s % base)) % base;
    return a;
  }
  encodeOri(a: number[]): number {
    if (!this.withOri) return 0;
    const base = this.kind === 'c' ? 3 : 2;
    let o = 0;
    for (let i = 0; i < this.m - 1; i++) o = o * base + a[i];
    return o;
  }
  /** Coordinate of a cube (pieces outside the set must be at home). */
  of(c: C.Cubie): [number, number] {
    const P = this.kind === 'c' ? c.cp : c.ep;
    const O = this.kind === 'c' ? c.co : c.eo;
    const local = new Map(this.pos.map((p, i) => [p, i]));
    const arr = this.pos.map((q) => {
      const l = local.get(P[q]);
      if (l === undefined) throw new Error('piece outside the set');
      return l;
    });
    return [permToIndex(arr, this.m), this.withOri ? this.encodeOri(this.pos.map((q) => O[q])) : 0];
  }
  get size() {
    return this.nPerm * this.nOri;
  }
}

/** Per-piece digits (position·ori) for a few tracked pieces. */
export const EDGE_T = new Uint8Array(24 * 18);
export const CORNER_T = new Uint8Array(24 * 18);
for (let m = 0; m < 18; m++) {
  const mv = C.MOVES[m];
  for (let p = 0; p < 12; p++) for (let o = 0; o < 2; o++) {
    const q = mv.ep.indexOf(p);
    EDGE_T[(p * 2 + o) * 18 + m] = q * 2 + ((o + mv.eo[q]) & 1);
  }
  for (let p = 0; p < 8; p++) for (let o = 0; o < 3; o++) {
    const q = mv.cp.indexOf(p);
    CORNER_T[(p * 3 + o) * 18 + m] = q * 3 + ((o + mv.co[q]) % 3);
  }
}
export interface Piece {
  kind: 'c' | 'e';
  id: number;
}
export function digitOf(c: C.Cubie, p: Piece): number {
  if (p.kind === 'e') {
    const q = c.ep.indexOf(p.id);
    return q * 2 + c.eo[q];
  }
  const q = c.cp.indexOf(p.id);
  return q * 3 + c.co[q];
}
export const stepDigit = (p: Piece, d: number, m: number) => (p.kind === 'e' ? EDGE_T[d * 18 + m] : CORNER_T[d * 18 + m]);

// ------------------------------------------------------------------ pattern databases

export function bfs(size: number, sources: number[], nMoves: number, next: (i: number, g: number) => number): Int8Array {
  const t = new Int8Array(size).fill(-1);
  let frontier: number[] | null = [];
  for (const s of sources) if (t[s] < 0) {
    t[s] = 0;
    frontier.push(s);
  }
  const LIMIT = 3_000_000;
  let d = 0;
  for (;;) {
    let produced = 0;
    let list: number[] | null = [];
    const visit = (i: number) => {
      for (let g = 0; g < nMoves; g++) {
        const j = next(i, g);
        if (t[j] < 0) {
          t[j] = d + 1;
          produced++;
          if (list) {
            if (list.length < LIMIT) list.push(j);
            else list = null;
          }
        }
      }
    };
    if (frontier) for (const i of frontier) visit(i);
    else for (let i = 0; i < size; i++) if (t[i] === d) visit(i);
    if (!produced) break;
    frontier = list;
    d++;
  }
  return t;
}

export const aufStates = (): C.Cubie[] => [0, 1, 2, 3].map((k) => C.applyMoves(C.solved(), Array(k).fill(0)));

// ------------------------------------------------------------------ IDA*

export interface Problem {
  moves: number[]; // global move ids
  width: number; // coordinate vector length
  init(c: C.Cubie): Int32Array;
  step(src: Int32Array, g: number, dst: Int32Array): void;
  h(x: Int32Array): number;
  goal(x: Int32Array): boolean;
}

const FACE = (m: number) => (m / 3) | 0;

/**
 * All solutions at the minimum depth (≤ maxDepth) for any of the start
 * states. Returns [startIndex, moves] pairs.
 */
export function search(p: Problem, starts: C.Cubie[], maxDepth: number, limit = 6, nodeCap = 4e8, extra = 0): [number, number[]][] {
  const out: [number, number[]][] = [];
  let base = 0;
  const stack: Int32Array[] = [];
  for (let i = 0; i <= maxDepth + 1; i++) stack.push(new Int32Array(p.width));
  const path: number[] = [];
  let nodes = 0;
  const G = p.moves.length;
  const dfs = (depth: number, togo: number, last: number, si: number): void => {
    const x = stack[depth];
    if (togo === 0) {
      if (p.goal(x)) out.push([si, path.slice()]);
      return;
    }
    for (let g = 0; g < G; g++) {
      const m = p.moves[g];
      const f = FACE(m);
      if (f === last || f + 3 === last) continue;
      // AUF is free: never start or finish with a U turn
      if (f === 0 && (depth === 0 || togo === 1)) continue;
      const y = stack[depth + 1];
      p.step(x, g, y);
      nodes++;
      if (p.h(y) >= togo) continue;
      path.push(m);
      dfs(depth + 1, togo - 1, f, si);
      path.pop();
      if (out.length - base >= limit || nodes > nodeCap) return;
    }
  };
  const inits = starts.map((s) => p.init(s));
  const minH = Math.min(...inits.map((x) => p.h(x)));
  if (minH < 0) return out;
  let firstFound = -1;
  for (let d = Math.max(0, minH); d <= maxDepth; d++) {
    const cap = firstFound < 0 ? limit : limit * 3;
    const before = out.length;
    for (let si = 0; si < inits.length; si++) {
      if (p.h(inits[si]) > d || p.h(inits[si]) < 0) continue;
      stack[0].set(inits[si]);
      const save = limit;
      limit = cap;
      dfs(0, d, -1, si);
      limit = save;
      if (out.length - before >= cap) break;
    }
    if (out.length && firstFound < 0) firstFound = d;
    if (nodes > nodeCap) break;
    if (firstFound >= 0 && d >= firstFound + extra) break;
  }
  return out;
}

// ------------------------------------------------------------------ problems

/** Full last-layer solve up to AUF (ZBLL / PLL), or corners-only goals (COLL, CMLL). */
export function llProblem(gen: Gen, goalKind: 'full' | 'coll' | 'cmll'): Problem {
  const moves = GEN_MOVES[gen].map(moveId);
  const G = moves.length;
  const cc = new SetCoord('c', GEN_CORNERS[gen], true, moves);
  const goals = aufStates();
  const cGoal = goals.map((g) => cc.of(g));
  const cIdx = (perm: number, ori: number) => perm * cc.nOri + ori;
  const cPdb = bfs(cc.size, cGoal.map(([a, b]) => cIdx(a, b)), G, (i, g) => {
    const perm = Math.floor(i / cc.nOri);
    const ori = i - perm * cc.nOri;
    return cIdx(cc.permMove[perm * G + g], cc.oriMove[ori * G + g]);
  });
  // edges
  const flips = gen === 'RUF';
  let ec: SetCoord | null = null;
  let ePdb: Int8Array | null = null;
  let eGoal: number[] = [];
  const digitsA: Piece[] = [0, 1, 2, 3, 5].map((id) => ({ kind: 'e', id }));
  const digitsB: Piece[] = [4, 8, 9, 11, 1].map((id) => ({ kind: 'e', id }));
  let dA: Int8Array | null = null;
  let dB: Int8Array | null = null;
  const f2lEdges = gen === 'RU' ? [4, 8, 11] : gen === 'RUD' ? [4, 5, 6, 7, 8, 11] : [4, 5, 8, 9, 11];
  if (!flips) {
    ec = new SetCoord('e', GEN_EDGES[gen], false, moves);
    eGoal = goals.map((g) => ec!.of(g)[0]);
    if (goalKind === 'full') ePdb = bfs(ec.nPerm, eGoal, G, (i, g) => ec!.permMove[i * G + g]);
  } else if (goalKind === 'full') {
    const dpdb = (ps: Piece[]) =>
      bfs(24 ** 5, goals.map((g) => ps.reduce((a, p) => a * 24 + digitOf(g, p), 0)), G, (i, g) => {
        let x = i;
        const d = [0, 0, 0, 0, 0];
        for (let k = 4; k >= 0; k--) {
          d[k] = x % 24;
          x = (x / 24) | 0;
        }
        let n = 0;
        for (let k = 0; k < 5; k++) n = n * 24 + stepDigit(ps[k], d[k], moves[g]);
        return n;
      });
    dA = dpdb(digitsA);
    dB = dpdb(digitsB);
  }
  // coordinate vector: [cperm, cori, eperm | (digitsA×5, digitsB×5)]
  const width = flips ? 2 + 10 : 3;
  const edgeHome = (x: Int32Array): boolean => {
    // F2L edges home, LL edges oriented (for coll); cmll: only the block edges home
    if (!flips) {
      const arr = indexToPerm(x[2], ec!.m);
      for (let i = 0; i < ec!.m; i++) {
        const posId = ec!.pos[i];
        const pieceId = ec!.pos[arr[i]];
        const need = goalKind === 'cmll' ? [4, 8, 11, 6, 9, 10].includes(posId) : f2lEdges.includes(posId);
        if (need && pieceId !== posId) return false;
      }
      return true;
    }
    // digits: A = UR UF UL UB DF, B = DR FR FL BR UF
    const all = [...x.slice(2, 7), ...x.slice(7, 12)];
    const ids = [0, 1, 2, 3, 5, 4, 8, 9, 11, 1];
    for (let k = 0; k < 10; k++) {
      const id = ids[k];
      const d = all[k];
      const pos = d >> 1;
      const ori = d & 1;
      const isF2L = [4, 5, 8, 9, 11].includes(id);
      if (goalKind === 'cmll') {
        if ([4, 8, 9, 11].includes(id) && (pos !== id || ori !== 0)) return false;
      } else if (isF2L) {
        if (pos !== id || ori !== 0) return false;
      } else if (ori !== 0 || pos > 3) return false;
    }
    return true;
  };
  return {
    moves,
    width,
    init(c) {
      const v = new Int32Array(width);
      const [p, o] = cc.of(c);
      v[0] = p;
      v[1] = o;
      if (!flips) v[2] = ec!.of(c)[0];
      else {
        digitsA.forEach((pc, k) => (v[2 + k] = digitOf(c, pc)));
        digitsB.forEach((pc, k) => (v[7 + k] = digitOf(c, pc)));
      }
      return v;
    },
    step(s, g, d) {
      d[0] = cc.permMove[s[0] * G + g];
      d[1] = cc.oriMove[s[1] * G + g];
      if (!flips) d[2] = ec!.permMove[s[2] * G + g];
      else {
        const m = moves[g];
        for (let k = 2; k < 12; k++) d[k] = EDGE_T[s[k] * 18 + m];
      }
    },
    h(x) {
      let h = cPdb[x[0] * cc.nOri + x[1]];
      if (h < 0) return 99;
      if (ePdb) {
        const e = ePdb[x[2]];
        if (e < 0) return 99;
        if (e > h) h = e;
      }
      if (dA) {
        const a = dA[x[2] * 331776 + x[3] * 13824 + x[4] * 576 + x[5] * 24 + x[6]];
        const b = dB![x[7] * 331776 + x[8] * 13824 + x[9] * 576 + x[10] * 24 + x[11]];
        if (a < 0 || b < 0) return 99;
        if (a > h) h = a;
        if (b > h) h = b;
      }
      return h;
    },
    goal(x) {
      // corners must equal U^k; full goals need edges at the same k
      for (let k = 0; k < 4; k++) {
        if (x[0] !== cGoal[k][0] || x[1] !== cGoal[k][1]) continue;
        if (goalKind !== 'full') return edgeHome(x);
        if (!flips) return x[2] === eGoal[k];
        const g = goals[k];
        const want = [...digitsA, ...digitsB].map((pc) => digitOf(g, pc));
        for (let i = 0; i < 10; i++) if (x[2 + i] !== want[i]) return false;
        return true;
      }
      return false;
    },
  };
}

/** F2L pair problem: cross and all four slots must end solved; LL is free. */
export function f2lProblem(gen: Gen): Problem {
  const moves = GEN_MOVES[gen].map(moveId);
  const G = moves.length;
  const pieces: Piece[] =
    gen === 'RU'
      ? [{ kind: 'c', id: 4 }, { kind: 'c', id: 7 }, { kind: 'e', id: 4 }, { kind: 'e', id: 8 }, { kind: 'e', id: 11 }]
      : gen === 'RUF'
        ? [{ kind: 'c', id: 4 }, { kind: 'c', id: 5 }, { kind: 'c', id: 7 }, { kind: 'e', id: 4 }, { kind: 'e', id: 5 }, { kind: 'e', id: 8 }, { kind: 'e', id: 9 }, { kind: 'e', id: 11 }]
        : [{ kind: 'c', id: 4 }, { kind: 'c', id: 5 }, { kind: 'c', id: 6 }, { kind: 'c', id: 7 }, { kind: 'e', id: 4 }, { kind: 'e', id: 5 }, { kind: 'e', id: 6 }, { kind: 'e', id: 7 }, { kind: 'e', id: 8 }, { kind: 'e', id: 11 }];
  const k = pieces.length;
  // tables over chunks of ≤5 pieces
  const chunks: number[][] = [];
  for (let i = 0; i < k; i += 5) chunks.push(pieces.slice(i, i + 5).map((_, j) => i + j));
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 3) {
    const extra = chunks.pop()!;
    chunks[chunks.length - 1] = [...chunks[chunks.length - 1].slice(0, 5 - extra.length), ...extra];
  }
  const solvedDigits = pieces.map((p) => (p.kind === 'e' ? p.id * 2 : p.id * 3));
  const tables = chunks.map((ix) => {
    const n = ix.length;
    const ps = ix.map((i) => pieces[i]);
    const src = ix.reduce((a, i) => a * 24 + solvedDigits[i], 0);
    return {
      ix,
      t: bfs(24 ** n, [src], G, (idx, g) => {
        const d = new Array<number>(n);
        let x = idx;
        for (let q = n - 1; q >= 0; q--) {
          d[q] = x % 24;
          x = (x / 24) | 0;
        }
        let r = 0;
        for (let q = 0; q < n; q++) r = r * 24 + stepDigit(ps[q], d[q], moves[g]);
        return r;
      }),
    };
  });
  return {
    moves,
    width: k,
    init(c) {
      return Int32Array.from(pieces.map((p) => digitOf(c, p)));
    },
    step(s, g, d) {
      const m = moves[g];
      for (let i = 0; i < k; i++) d[i] = stepDigit(pieces[i], s[i], m);
    },
    h(x) {
      let h = 0;
      for (const { ix, t } of tables) {
        let idx = 0;
        for (const i of ix) idx = idx * 24 + x[i];
        const v = t[idx];
        if (v < 0) return 99;
        if (v > h) h = v;
      }
      return h;
    },
    goal(x) {
      for (let i = 0; i < k; i++) if (x[i] !== solvedDigits[i]) return false;
      return true;
    },
  };
}

/** ZBLS: F2L pair solved while orienting every edge (LL corners and permutation are free). */
export function zblsProblem(gen: Gen): Problem {
  const base = f2lProblem(gen);
  const moves = base.moves;
  const G = moves.length;
  // edge orientation of all 12 edges, 11 free bits
  const eoMove = new Uint16Array(2048 * G);
  for (let f = 0; f < 2048; f++) {
    const eo = new Array<number>(12);
    let s = 0;
    for (let i = 0; i < 11; i++) s += eo[i] = (f >> (10 - i)) & 1;
    eo[11] = s & 1;
    for (let g = 0; g < G; g++) {
      const mv = C.MOVES[moves[g]];
      let n = 0;
      for (let i = 0; i < 11; i++) n = n * 2 + ((eo[mv.ep[i]] + mv.eo[i]) & 1);
      eoMove[f * G + g] = n;
    }
  }
  const eoDist = bfs(2048, [0], G, (i, g) => eoMove[i * G + g]);
  const w = base.width;
  return {
    moves,
    width: w + 1,
    init(c) {
      const v = new Int32Array(w + 1);
      v.set(base.init(c));
      let f = 0;
      for (let i = 0; i < 11; i++) f = f * 2 + c.eo[i];
      v[w] = f;
      return v;
    },
    step(s, g, d) {
      base.step(s, g, d);
      d[w] = eoMove[s[w] * G + g];
    },
    h(x) {
      const a = base.h(x);
      const b = eoDist[x[w]];
      return a > b ? a : b;
    },
    goal(x) {
      return x[w] === 0 && base.goal(x);
    },
  };
}
