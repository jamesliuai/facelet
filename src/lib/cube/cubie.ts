/**
 * Cubie-level model of the 3x3x3 (Kociemba conventions).
 *
 * Corners: URF UFL ULB UBR DFR DLF DBL DRB
 * Edges:   UR UF UL UB DR DF DL DB FR FL BL BR
 * Faces:   U R F D L B (facelet order U1..U9 R1..R9 F1..F9 D1..D9 L1..L9 B1..B9)
 *
 * cp[i] = which corner sits in position i, co[i] its twist (0..2);
 * likewise ep/eo for edges. multiply(a, b) = apply a, then b.
 */
import { randInt, randPerm, permParity } from '../rand';

export interface Cubie {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

export const FACE_CHARS = 'URFDLB';
export const MOVE_NAMES = [
  'U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'",
  'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'",
];

const Z8 = [0, 0, 0, 0, 0, 0, 0, 0];
const Z12 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const BASIC: Cubie[] = [
  { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: Z8, ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: Z12 }, // U
  { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: Z12 }, // R
  { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] }, // F
  { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: Z8, ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: Z12 }, // D
  { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: Z12 }, // L
  { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] }, // B
];

export function solved(): Cubie {
  return { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: Z8.slice(), ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: Z12.slice() };
}

export function clone(c: Cubie): Cubie {
  return { cp: c.cp.slice(), co: c.co.slice(), ep: c.ep.slice(), eo: c.eo.slice() };
}

/** a * b: the state reached by applying a, then b. */
export function multiply(a: Cubie, b: Cubie): Cubie {
  const r = solved();
  for (let i = 0; i < 8; i++) {
    r.cp[i] = a.cp[b.cp[i]];
    r.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    r.ep[i] = a.ep[b.ep[i]];
    r.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) & 1;
  }
  return r;
}

export function invert(a: Cubie): Cubie {
  const r = solved();
  for (let i = 0; i < 8; i++) {
    r.cp[a.cp[i]] = i;
  }
  for (let i = 0; i < 8; i++) {
    r.co[i] = (3 - a.co[r.cp[i]]) % 3;
  }
  for (let i = 0; i < 12; i++) r.ep[a.ep[i]] = i;
  for (let i = 0; i < 12; i++) r.eo[i] = a.eo[r.ep[i]];
  return r;
}

export const MOVES: Cubie[] = (() => {
  const out: Cubie[] = [];
  for (let f = 0; f < 6; f++) {
    const q1 = BASIC[f];
    const q2 = multiply(q1, q1);
    const q3 = multiply(q2, q1);
    out.push(clone(q1), q2, q3);
  }
  return out;
})();

export function applyMove(c: Cubie, m: number): Cubie {
  return multiply(c, MOVES[m]);
}

export function applyMoves(c: Cubie, moves: readonly number[]): Cubie {
  let r = c;
  for (const m of moves) r = multiply(r, MOVES[m]);
  return r;
}

export function equals(a: Cubie, b: Cubie): boolean {
  for (let i = 0; i < 8; i++) if (a.cp[i] !== b.cp[i] || a.co[i] !== b.co[i]) return false;
  for (let i = 0; i < 12; i++) if (a.ep[i] !== b.ep[i] || a.eo[i] !== b.eo[i]) return false;
  return true;
}

export function isSolved(c: Cubie): boolean {
  return equals(c, solved());
}

/** Parse a sequence of outer face moves (U R F D L B with ' and 2). */
export function parseMoves(s: string): number[] {
  const out: number[] = [];
  const re = /([URFDLB])\s*(2'|2|'|’|′|3)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const face = FACE_CHARS.indexOf(m[1]);
    const suf = m[2];
    const pow = suf === undefined ? 0 : suf.startsWith('2') ? 1 : 2;
    out.push(face * 3 + pow);
  }
  return out;
}

export function movesToString(moves: readonly number[]): string {
  return moves.map((m) => MOVE_NAMES[m]).join(' ');
}

export function invertMoves(moves: readonly number[]): number[] {
  return moves
    .slice()
    .reverse()
    .map((m) => m - (m % 3) + (2 - (m % 3)));
}

/** A uniformly random solvable cube. */
export function random(): Cubie {
  const c = solved();
  c.cp = randPerm(8);
  c.ep = randPerm(12);
  if (permParity(c.cp) !== permParity(c.ep)) {
    const t = c.ep[0];
    c.ep[0] = c.ep[1];
    c.ep[1] = t;
  }
  let s = 0;
  for (let i = 0; i < 7; i++) s += c.co[i] = randInt(3);
  c.co[7] = (3 - (s % 3)) % 3;
  s = 0;
  for (let i = 0; i < 11; i++) s += c.eo[i] = randInt(2);
  c.eo[11] = s & 1;
  return c;
}

export function isValid(c: Cubie): boolean {
  const cs = new Set(c.cp);
  const es = new Set(c.ep);
  if (cs.size !== 8 || es.size !== 12) return false;
  if (c.co.reduce((a, b) => a + b, 0) % 3 !== 0) return false;
  if (c.eo.reduce((a, b) => a + b, 0) % 2 !== 0) return false;
  return permParity(c.cp) === permParity(c.ep);
}

// ---------------------------------------------------------------- facelets

export const CORNER_FACELET = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
export const EDGE_FACELET = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
// U=0 R=1 F=2 D=3 L=4 B=5
export const CORNER_COLOR = [
  [0, 1, 2], [0, 2, 4], [0, 4, 5], [0, 5, 1],
  [3, 2, 1], [3, 4, 2], [3, 5, 4], [3, 1, 5],
];
export const EDGE_COLOR = [
  [0, 1], [0, 2], [0, 4], [0, 5], [3, 1], [3, 2],
  [3, 4], [3, 5], [2, 1], [2, 4], [5, 4], [5, 1],
];

/** 54 face indices (0..5) in URFDLB facelet order. */
export function toFacelets(c: Cubie): number[] {
  const f = new Array<number>(54);
  for (let i = 0; i < 6; i++) f[i * 9 + 4] = i;
  for (let i = 0; i < 8; i++) {
    const j = c.cp[i];
    const ori = c.co[i];
    for (let n = 0; n < 3; n++) f[CORNER_FACELET[i][(n + ori) % 3]] = CORNER_COLOR[j][n];
  }
  for (let i = 0; i < 12; i++) {
    const j = c.ep[i];
    const ori = c.eo[i];
    for (let n = 0; n < 2; n++) f[EDGE_FACELET[i][(n + ori) % 2]] = EDGE_COLOR[j][n];
  }
  return f;
}

/** Inverse of toFacelets. Centres must be standard. Returns null when invalid. */
export function fromFacelets(f: readonly number[]): Cubie | null {
  for (let i = 0; i < 6; i++) if (f[i * 9 + 4] !== i) return null;
  const c = solved();
  c.cp.fill(-1);
  c.ep.fill(-1);
  for (let i = 0; i < 8; i++) {
    let ori = 0;
    for (; ori < 3; ori++) {
      const col = f[CORNER_FACELET[i][ori]];
      if (col === 0 || col === 3) break;
    }
    if (ori === 3) return null;
    const c1 = f[CORNER_FACELET[i][(ori + 1) % 3]];
    const c2 = f[CORNER_FACELET[i][(ori + 2) % 3]];
    for (let j = 0; j < 8; j++) {
      if (c1 === CORNER_COLOR[j][1] && c2 === CORNER_COLOR[j][2]) {
        c.cp[i] = j;
        c.co[i] = ori % 3;
        break;
      }
    }
    if (c.cp[i] < 0) return null;
  }
  for (let i = 0; i < 12; i++) {
    const a = f[EDGE_FACELET[i][0]];
    const b = f[EDGE_FACELET[i][1]];
    for (let j = 0; j < 12; j++) {
      if (a === EDGE_COLOR[j][0] && b === EDGE_COLOR[j][1]) {
        c.ep[i] = j;
        c.eo[i] = 0;
        break;
      }
      if (a === EDGE_COLOR[j][1] && b === EDGE_COLOR[j][0]) {
        c.ep[i] = j;
        c.eo[i] = 1;
        break;
      }
    }
    if (c.ep[i] < 0) return null;
  }
  return isValid(c) ? c : null;
}
