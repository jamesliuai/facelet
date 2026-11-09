/**
 * Pyraminx: geometric sticker model, random-state scrambler and net layout
 * for scramble images.
 *
 * Scrambles follow TNoodle: a uniformly random state (tips included) that
 * needs at least 6 moves counting tips (WCA 4b3), written as exactly 11
 * non-tip moves (TNoodle's generateExactly(state, 11)) plus one move per
 * unsolved tip.
 *
 * Orientation (WCA 4d2): yellow bottom, green front. Faces: F, L, R, D.
 */
import { randInt, shuffle } from '../rand';
import { bfsTable, indexToPerm, permToIndex } from '../cube/coord';
import {
  type V2, type V3, type StickerDef, centroid, cross, dot, movePerm, norm, pieceMove, reflect2,
  affine3to2, subdivideTriangle, sub, applyPerm,
} from './geom';

const r = Math.sqrt(8 / 9);
const VERT: Record<'U' | 'L' | 'R' | 'B', V3> = {
  U: [0, 1, 0],
  L: [-r * Math.sin(Math.PI / 3), -1 / 3, r * Math.cos(Math.PI / 3)],
  R: [r * Math.sin(Math.PI / 3), -1 / 3, r * Math.cos(Math.PI / 3)],
  B: [0, -1 / 3, -r],
};
type VName = keyof typeof VERT;
const VNAMES: VName[] = ['U', 'L', 'R', 'B'];

/** Faces as vertex triples; index = colour. F (green), L (red), R (blue), D (yellow). */
const FACES: [VName, VName, VName][] = [
  ['U', 'L', 'R'],
  ['U', 'B', 'L'],
  ['U', 'R', 'B'],
  ['L', 'B', 'R'],
];
export const PYRA_FACE_NAMES = ['F', 'L', 'R', 'D'];

export const STICKERS: StickerDef[] = [];
FACES.forEach((f, face) => {
  for (const tri of subdivideTriangle(VERT[f[0]], VERT[f[1]], VERT[f[2]], 3)) {
    STICKERS.push({ face, poly: tri, c: centroid(tri) });
  }
});

const TIP_DEPTH = 5 / 9;
const BIG_DEPTH = 1 / 9;

function layerSet(c: V3, depth: number): VName[] {
  return VNAMES.filter((v) => dot(c, VERT[v]) > depth);
}

/** Move perms: index = vertex*2 + (0 big, 1 tip). */
const PERMS: Record<string, Int16Array> = {};
for (const v of VNAMES) {
  PERMS[v] = movePerm(STICKERS, { axis: norm(VERT[v]), depth: BIG_DEPTH, angle: (2 * Math.PI) / 3 });
  PERMS[v.toLowerCase()] = movePerm(STICKERS, { axis: norm(VERT[v]), depth: TIP_DEPTH, angle: (2 * Math.PI) / 3 });
}

export function solvedState(): Uint8Array {
  return Uint8Array.from(STICKERS.map((s) => s.face));
}

export function applyScramble(state: Uint8Array, scr: string): Uint8Array {
  let s = state;
  for (const tok of scr.trim().split(/\s+/)) {
    if (!tok) continue;
    const m = /^([ULRBulrb])('?)$/.exec(tok);
    if (!m) continue;
    s = applyPerm(s, PERMS[m[1]], m[2] ? 2 : 1);
  }
  return s;
}

// ------------------------------------------------------------------ pieces

function angleAround(axis: V3, p: V3): number {
  const a = norm(axis);
  const ref = norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const ref2 = cross(a, ref);
  return Math.atan2(dot(p, ref2), dot(p, ref));
}

const edgePieces: number[][] = [];
const edgeKeys: string[] = [];
const axialPieces: number[][] = [];
{
  const edges = new Map<string, number[]>();
  const axials = new Map<VName, number[]>();
  STICKERS.forEach((s, i) => {
    const big = layerSet(s.c, BIG_DEPTH);
    const tip = layerSet(s.c, TIP_DEPTH);
    if (big.length === 2) {
      const k = big.join('');
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k)!.push(i);
    } else if (big.length === 1 && tip.length === 0) {
      if (!axials.has(big[0])) axials.set(big[0], []);
      axials.get(big[0])!.push(i);
    }
  });
  for (const [k, st] of edges) {
    edgeKeys.push(k);
    edgePieces.push(st);
  }
  for (const v of VNAMES) {
    const st = axials.get(v)!;
    st.sort((a, b) => angleAround(VERT[v], STICKERS[a].c) - angleAround(VERT[v], STICKERS[b].c));
    axialPieces.push(st);
  }
}

const N_EP = 720;
const N_EO = 64;
const N_AX = 81;
const N_STATES = N_EP * N_EO * N_AX;
const MOVE_NAMES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"];

let edgeMove: Uint16Array | null = null;
let axMove: Uint8Array | null = null;
let dist: Int8Array | null = null;

function initTables() {
  if (dist) return;
  const em = new Uint16Array(N_EP * N_EO * 8);
  const am = new Uint8Array(N_AX * 8);
  const moves = VNAMES.flatMap((v) => {
    const p1 = PERMS[v];
    // gather perm composed twice for the inverse direction
    const p2 = new Int16Array(p1.length);
    for (let i = 0; i < p1.length; i++) p2[i] = p1[p1[i]];
    return [p1, p2];
  });
  const emv = moves.map((p) => pieceMove(p, edgePieces));
  const amv = moves.map((p) => pieceMove(p, axialPieces));
  for (let ep = 0; ep < N_EP; ep++) {
    const perm = indexToPerm(ep, 6);
    for (let eo = 0; eo < N_EO; eo++) {
      const ori = [0, 0, 0, 0, 0, 0].map((_, i) => (eo >> i) & 1);
      for (let m = 0; m < 8; m++) {
        const { dest, twist } = emv[m];
        const np = new Array<number>(6);
        const no = new Array<number>(6);
        for (let p = 0; p < 6; p++) {
          np[dest[p]] = perm[p];
          no[dest[p]] = (ori[p] + twist[p]) & 1;
        }
        let o = 0;
        for (let i = 0; i < 6; i++) o |= no[i] << i;
        em[(ep * N_EO + eo) * 8 + m] = permToIndex(np, 6) * N_EO + o;
      }
    }
  }
  for (let a = 0; a < N_AX; a++) {
    const ori = [a % 3, ((a / 3) | 0) % 3, ((a / 9) | 0) % 3, ((a / 27) | 0) % 3];
    for (let m = 0; m < 8; m++) {
      const { dest, twist } = amv[m];
      const no = new Array<number>(4);
      for (let p = 0; p < 4; p++) no[dest[p]] = (ori[p] + twist[p]) % 3;
      am[a * 8 + m] = no[0] + no[1] * 3 + no[2] * 9 + no[3] * 27;
    }
  }
  edgeMove = em;
  axMove = am;
  dist = bfsTable(N_STATES, 0, 8, (i, m) => {
    const e = (i / N_AX) | 0;
    const a = i - e * N_AX;
    return em[e * 8 + m] * N_AX + am[a * 8 + m];
  });
}

function next(i: number, m: number): number {
  const e = (i / N_AX) | 0;
  const a = i - e * N_AX;
  return edgeMove![e * 8 + m] * N_AX + axMove![a * 8 + m];
}

/** Optimal solution (move names) for a state index. */
function solveIndex(idx: number): string[] {
  const out: string[] = [];
  let d = dist![idx];
  while (d > 0) {
    for (let m = 0; m < 8; m++) {
      const j = next(idx, m);
      if (dist![j] === d - 1) {
        out.push(MOVE_NAMES[m]);
        idx = j;
        d--;
        break;
      }
    }
  }
  return out;
}

const invertName = (m: string) => (m.endsWith("'") ? m[0] : m + "'");

/** TNoodle's fixed count of non-tip moves. */
export const SCRAMBLE_LENGTH = 11;

/** A random solution of exactly `length` moves, no axis twice in a row. */
function exactSolution(idx: number, length: number): string[] | null {
  const path: string[] = [];
  const order = [0, 1, 2, 3, 4, 5, 6, 7];
  const dfs = (i: number, togo: number, lastAxis: number): boolean => {
    if (togo === 0) return i === 0;
    for (const m of shuffle(order.slice())) {
      const ax = m >> 1;
      if (ax === lastAxis) continue;
      const j = next(i, m);
      if (dist![j] > togo - 1) continue;
      path.push(MOVE_NAMES[m]);
      if (dfs(j, togo - 1, ax)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(idx, length, -1) ? path : null;
}

export function randomScramble(): string {
  initTables();
  for (;;) {
    let idx: number;
    do idx = randInt(N_STATES);
    while (dist![idx] < 0);
    const tips = [0, 1, 2, 3].map(() => randInt(3));
    const tipMoves = tips.filter((t) => t > 0).length;
    if (dist![idx] + tipMoves < 6) continue;
    const sol = exactSolution(idx, SCRAMBLE_LENGTH) ?? solveIndex(idx);
    const scr = sol.reverse().map(invertName);
    'ulrb'.split('').forEach((t, i) => {
      if (tips[i] === 1) scr.push(t);
      else if (tips[i] === 2) scr.push(t + "'");
    });
    return scr.join(' ');
  }
}

function walk(scr: string): number {
  initTables();
  let idx = 0;
  for (const tok of scr.trim().split(/\s+/)) {
    const m = MOVE_NAMES.indexOf(tok);
    if (m >= 0) idx = next(idx, m);
  }
  return idx;
}

/** Optimal distance of the state produced by a scramble (tips excluded). */
export function stateDistance(scr: string): number {
  return dist![walk(scr)];
}

/** Optimal solution (big moves only) for the state produced by a scramble. */
export function solveScramble(scr: string): string {
  return solveIndex(walk(scr)).join(' ');
}

// ------------------------------------------------------------------ net

/** 2D polygons per sticker for the standard net (F up-triangle in the centre). */
export function netPolygons(size = 1, gap = 0.06): V2[][] {
  const h = (Math.sqrt(3) / 2) * size;
  const U2: V2 = [0, -h * 0.5];
  const L2: V2 = [-size / 2, h * 0.5];
  const R2: V2 = [size / 2, h * 0.5];
  // per face: 2D images of its three vertices
  const faces2d: [V2, V2, V2][] = [
    [U2, L2, R2], // F
    [U2, reflect2(R2, U2, L2), L2], // L: (U, B, L)
    [U2, R2, reflect2(L2, U2, R2)], // R: (U, R, B)
    [L2, reflect2(U2, L2, R2), R2], // D: (L, B, R)
  ];
  // push faces apart slightly from the centre for visual gaps
  const centre: V2 = [0, h * 0.1667];
  return STICKERS.map((s) => {
    const f = FACES[s.face];
    const [a2, b2, c2] = faces2d[s.face];
    const fc: V2 = [(a2[0] + b2[0] + c2[0]) / 3, (a2[1] + b2[1] + c2[1]) / 3];
    const dir: V2 = s.face === 0 ? [0, 0] : [fc[0] - centre[0], fc[1] - centre[1]];
    return s.poly.map((p) => {
      const q = affine3to2(p, VERT[f[0]], VERT[f[1]], VERT[f[2]], a2, b2, c2);
      return [q[0] + dir[0] * gap * 2, q[1] + dir[1] * gap * 2] as V2;
    });
  });
}

export { sub };
