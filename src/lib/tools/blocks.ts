/**
 * Optimal block solvers for the current scramble: cross (all six colours),
 * XCross, EOLine (ZZ), Roux first block and 2x2x2 block.
 *
 * Tracked pieces are encoded as base-24 digits (position · orientation), so
 * a move only needs a tiny 24×18 lookup per piece. IDA* uses BFS pruning
 * tables over subsets of the tracked pieces.
 */
import * as Cubie from '../cube/cubie';
import { StickerCube } from '../cube/nxn';

const EDGE_T = new Uint8Array(24 * 18);
const CORNER_T = new Uint8Array(24 * 18);
for (let m = 0; m < 18; m++) {
  const mv = Cubie.MOVES[m];
  for (let p = 0; p < 12; p++) {
    for (let o = 0; o < 2; o++) {
      const q = mv.ep.indexOf(p);
      EDGE_T[(p * 2 + o) * 18 + m] = q * 2 + ((o + mv.eo[q]) & 1);
    }
  }
  for (let p = 0; p < 8; p++) {
    for (let o = 0; o < 3; o++) {
      const q = mv.cp.indexOf(p);
      CORNER_T[(p * 3 + o) * 18 + m] = q * 3 + ((o + mv.co[q]) % 3);
    }
  }
}

interface Tracked {
  kind: 'e' | 'c';
  id: number;
}

function digitOf(c: Cubie.Cubie, t: Tracked): number {
  if (t.kind === 'e') {
    const q = c.ep.indexOf(t.id);
    return q * 2 + c.eo[q];
  }
  const q = c.cp.indexOf(t.id);
  return q * 3 + c.co[q];
}

const solvedDigit = (t: Tracked) => (t.kind === 'e' ? t.id * 2 : t.id * 3);
const stepDigit = (t: Tracked, d: number, m: number) => (t.kind === 'e' ? EDGE_T[d * 18 + m] : CORNER_T[d * 18 + m]);

const tableCache = new Map<string, Int8Array>();

function pruneTable(pieces: Tracked[]): Int8Array {
  const key = pieces.map((p) => p.kind + p.id).join(',');
  let t = tableCache.get(key);
  if (t) return t;
  const k = pieces.length;
  const size = 24 ** k;
  t = new Int8Array(size).fill(-1);
  let start = 0;
  for (const p of pieces) start = start * 24 + solvedDigit(p);
  t[start] = 0;
  let frontier = [start];
  let depth = 0;
  const digits = new Array<number>(k);
  while (frontier.length) {
    const next: number[] = [];
    for (const idx of frontier) {
      let x = idx;
      for (let i = k - 1; i >= 0; i--) {
        digits[i] = x % 24;
        x = (x / 24) | 0;
      }
      for (let m = 0; m < 18; m++) {
        let n = 0;
        for (let i = 0; i < k; i++) n = n * 24 + stepDigit(pieces[i], digits[i], m);
        if (t[n] === -1) {
          t[n] = depth + 1;
          next.push(n);
        }
      }
    }
    frontier = next;
    depth++;
  }
  tableCache.set(key, t);
  return t;
}

interface BlockProblem {
  pieces: Tracked[];
  /** each entry: indices into pieces covered by one pruning table */
  tables: number[][];
  /** optional extra coordinate (edge orientation of all edges for EOLine) */
  eo?: boolean;
}

let EO_MOVE: Uint16Array | null = null;
let EO_TABLE: Int8Array | null = null;
function eoMove(): Uint16Array {
  if (EO_MOVE) return EO_MOVE;
  EO_MOVE = new Uint16Array(2048 * 18);
  for (let f = 0; f < 2048; f++) {
    const eo = new Array<number>(12);
    let s = 0;
    for (let i = 0; i < 11; i++) s += eo[i] = (f >> (10 - i)) & 1;
    eo[11] = s & 1;
    for (let m = 0; m < 18; m++) {
      const mv = Cubie.MOVES[m];
      let n = 0;
      for (let i = 0; i < 11; i++) n = n * 2 + ((eo[mv.ep[i]] + mv.eo[i]) & 1);
      EO_MOVE[f * 18 + m] = n;
    }
  }
  // distance table for EO alone
  const t = new Int8Array(2048).fill(-1);
  t[0] = 0;
  let frontier = [0];
  let d = 0;
  while (frontier.length) {
    const nx: number[] = [];
    for (const f of frontier) for (let m = 0; m < 18; m++) {
      const g = EO_MOVE[f * 18 + m];
      if (t[g] < 0) {
        t[g] = d + 1;
        nx.push(g);
      }
    }
    frontier = nx;
    d++;
  }
  EO_TABLE = t;
  return EO_MOVE;
}
const eoOf = (c: Cubie.Cubie) => {
  let f = 0;
  for (let i = 0; i < 11; i++) f = f * 2 + c.eo[i];
  return f;
};

/** All optimal solutions (up to `limit`), as move index arrays. */
function solveBlock(c: Cubie.Cubie, prob: BlockProblem, limit = 3, maxDepth = 14): number[][] {
  const k = prob.pieces.length;
  const tables = prob.tables.map((ix) => ({ ix, t: pruneTable(ix.map((i) => prob.pieces[i])) }));
  const em = prob.eo ? eoMove() : null;
  const digits = prob.pieces.map((p) => digitOf(c, p));
  const goal = prob.pieces.map(solvedDigit);
  const h = (d: number[], eo: number) => {
    let best = 0;
    for (const { ix, t } of tables) {
      let idx = 0;
      for (const i of ix) idx = idx * 24 + d[i];
      const v = t[idx];
      if (v > best) best = v;
    }
    if (em && EO_TABLE![eo] > best) best = EO_TABLE![eo];
    return best;
  };
  const sols: number[][] = [];
  const path: number[] = [];
  let nodes = 0;
  const dfs = (d: number[], eo: number, togo: number, last: number): void => {
    if (sols.length >= limit || nodes > 3e6) return;
    if (togo === 0) {
      if (d.every((x, i) => x === goal[i]) && eo === 0) sols.push(path.slice());
      return;
    }
    for (let m = 0; m < 18; m++) {
      const face = (m / 3) | 0;
      if (face === last || face + 3 === last) continue;
      nodes++;
      const nd = new Array<number>(k);
      for (let i = 0; i < k; i++) nd[i] = stepDigit(prob.pieces[i], d[i], m);
      const ne = em ? em[eo * 18 + m] : 0;
      if (h(nd, ne) >= togo) continue;
      path.push(m);
      dfs(nd, ne, togo - 1, face);
      path.pop();
      if (sols.length >= limit) return;
    }
  };
  const eo0 = prob.eo ? eoOf(c) : 0;
  for (let depth = h(digits, eo0); depth <= maxDepth; depth++) {
    dfs(digits, eo0, depth, -1);
    if (sols.length) break;
  }
  return sols;
}

// ------------------------------------------------------------------ orientation

const E = (id: number): Tracked => ({ kind: 'e', id });
const K = (id: number): Tracked => ({ kind: 'c', id });

/** Re-express the scrambled cube as held after `rotation` (centres relabelled). */
function heldCube(scramble: string, rotation: string): Cubie.Cubie | null {
  const sc = new StickerCube(3).apply(scramble);
  if (rotation) sc.apply(rotation);
  const centres = [4, 13, 22, 31, 40, 49].map((i) => sc.s[i]);
  const map = new Array<number>(6);
  centres.forEach((col, face) => (map[col] = face));
  return Cubie.fromFacelets(Array.from(sc.s, (col) => map[col]));
}

export const COLOURS = ['White', 'Red', 'Green', 'Yellow', 'Orange', 'Blue'];
/** Rotation that brings each colour (by WCA face U R F D L B) to the bottom. */
const TO_BOTTOM = ['z2', 'z', "x'", '', "z'", 'x'];

export interface ToolRow {
  label: string;
  rotation: string;
  solutions: string[];
  length: number;
}

export interface ToolResult {
  title: string;
  rows: ToolRow[];
}

const CROSS: BlockProblem = { pieces: [E(4), E(5), E(6), E(7)], tables: [[0, 1, 2, 3]] };

// FR slot = corner DFR (4), edge FR (8). Other slots via y rotations.
const XCROSS: BlockProblem = {
  pieces: [E(4), E(5), E(6), E(7), E(8), K(4)],
  tables: [[0, 1, 2, 3], [4, 5, 0, 1], [4, 5, 2, 3]],
};
const EOLINE: BlockProblem = { pieces: [E(5), E(7)], tables: [[0, 1]], eo: true };
// Roux first block on the left: DL (6), FL (9), BL (10), DLF (5), DBL (6)
const ROUX_FB: BlockProblem = {
  pieces: [E(6), E(9), E(10), K(5), K(6)],
  tables: [[0, 1, 2], [3, 4, 0], [3, 4, 1], [3, 4, 2]],
};
// 2x2x2 at DBL: DL (6), DB (7), BL (10), DBL (6)
const BLOCK222: BlockProblem = { pieces: [E(6), E(7), E(10), K(6)], tables: [[0, 1, 2, 3]] };

function fmt(rot: string, sols: number[][]): string[] {
  return sols.map((s) => Cubie.movesToString(s));
}

export function runTool(tool: string, scramble: string, options: { colour?: number; limit?: number } = {}): ToolResult {
  const limit = options.limit ?? 2;
  const colours = options.colour != null && options.colour >= 0 ? [options.colour] : [0, 1, 2, 3, 4, 5];
  const rows: ToolRow[] = [];
  const add = (label: string, rotation: string, prob: BlockProblem, maxDepth = 12) => {
    const c = heldCube(scramble, rotation);
    if (!c) return;
    const sols = solveBlock(c, prob, limit, maxDepth);
    rows.push({ label, rotation, solutions: fmt(rotation, sols), length: sols[0]?.length ?? -1 });
  };
  switch (tool) {
    case 'cross':
      for (const col of colours) add(COLOURS[col], TO_BOTTOM[col], CROSS, 8);
      return { title: 'Cross', rows };
    case 'xcross': {
      const col = options.colour ?? 0;
      const slots: [string, string][] = [['FR', ''], ['FL', "y'"], ['BL', 'y2'], ['BR', 'y']];
      for (const [slot, y] of slots) add(`${COLOURS[col]} · ${slot}`, `${TO_BOTTOM[col]} ${y}`.trim(), XCROSS, 11);
      rows.sort((a, b) => a.length - b.length);
      return { title: 'XCross', rows };
    }
    case 'eoline':
      for (const col of colours) {
        // ZZ: line on the bottom, front stays front where possible
        add(COLOURS[col], TO_BOTTOM[col], EOLINE, 10);
      }
      return { title: 'EOLine', rows };
    case 'roux': {
      const col = options.colour ?? 0;
      for (const [label, y] of [['left', ''], ['front', 'y'], ['right', 'y2'], ['back', "y'"]] as const) {
        add(`${COLOURS[col]} · ${label}`, `${TO_BOTTOM[col]} ${y}`.trim(), ROUX_FB, 11);
      }
      rows.sort((a, b) => a.length - b.length);
      return { title: 'Roux first block', rows };
    }
    case '222': {
      for (const col of colours) add(COLOURS[col], TO_BOTTOM[col], BLOCK222, 10);
      return { title: '2x2x2 block', rows };
    }
  }
  return { title: tool, rows };
}
