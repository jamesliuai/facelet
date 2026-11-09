/**
 * 2x2x2: random-state scrambler with R, U, F (DBL corner fixed), as TNoodle:
 * a uniformly random state that needs at least 4 moves (WCA 4b3b), written
 * as a generator of exactly 11 moves (TNoodle's generateExactly(state, 11)),
 * so the scramble length says nothing about how close to solved it is.
 * Full BFS over all 3,674,160 states (7! permutations × 3^6 twists).
 */
import { randInt, randPerm, shuffle } from '../rand';
import { bfsTable, indexToPerm, permToIndex } from '../cube/coord';
import { MOVES } from '../cube/cubie';

// Corner positions used (DBL = 6 is fixed).
const POS = [0, 1, 2, 3, 4, 5, 7];
const NAMES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'"];
const N_PERM = 5040;
const N_TWIST = 729;

let permMove: Uint16Array | null = null;
let twistMove: Uint16Array | null = null;
let dist: Int8Array | null = null;

function expand(perm7: number[], co7: number[]): { cp: number[]; co: number[] } {
  const cp = [0, 1, 2, 3, 4, 5, 6, 7];
  const co = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 7; i++) {
    cp[POS[i]] = POS[perm7[i]];
    co[POS[i]] = co7[i];
  }
  return { cp, co };
}

function twistOf(co7: number[]): number {
  let t = 0;
  for (let i = 0; i < 6; i++) t = t * 3 + co7[i];
  return t;
}
function twistArr(t: number): number[] {
  const o = new Array<number>(7);
  let s = 0;
  for (let i = 5; i >= 0; i--) {
    o[i] = t % 3;
    s += o[i];
    t = (t / 3) | 0;
  }
  o[6] = (3 - (s % 3)) % 3;
  return o;
}

function init() {
  if (dist) return;
  const pm = new Uint16Array(N_PERM * 9);
  const tm = new Uint16Array(N_TWIST * 9);
  for (let p = 0; p < N_PERM; p++) {
    const perm = indexToPerm(p, 7);
    const { cp } = expand(perm, [0, 0, 0, 0, 0, 0, 0]);
    for (let m = 0; m < 9; m++) {
      const mv = MOVES[m];
      const ncp = cp.map((_, i) => cp[mv.cp[i]]);
      pm[p * 9 + m] = permToIndex(POS.map((q) => POS.indexOf(ncp[q])), 7);
    }
  }
  for (let t = 0; t < N_TWIST; t++) {
    const { co } = expand([0, 1, 2, 3, 4, 5, 6], twistArr(t));
    for (let m = 0; m < 9; m++) {
      const mv = MOVES[m];
      const nco = co.map((_, i) => (co[mv.cp[i]] + mv.co[i]) % 3);
      tm[t * 9 + m] = twistOf(POS.map((q) => nco[q]));
    }
  }
  permMove = pm;
  twistMove = tm;
  dist = bfsTable(N_PERM * N_TWIST, 0, 9, (i, m) => {
    const p = (i / N_TWIST) | 0;
    const t = i - p * N_TWIST;
    return pm[p * 9 + m] * N_TWIST + tm[t * 9 + m];
  });
}

function solveIndex(idx: number): number[] {
  const out: number[] = [];
  let d = dist![idx];
  let lastFace = -1;
  while (d > 0) {
    for (let m = 0; m < 9; m++) {
      if (((m / 3) | 0) === lastFace) continue;
      const p = (idx / N_TWIST) | 0;
      const t = idx - p * N_TWIST;
      const j = permMove![p * 9 + m] * N_TWIST + twistMove![t * 9 + m];
      if (dist![j] === d - 1) {
        out.push(m);
        idx = j;
        d--;
        lastFace = (m / 3) | 0;
        break;
      }
    }
  }
  return out;
}

const inv = (m: number) => m - (m % 3) + (2 - (m % 3));

/** TNoodle's fixed 2x2x2 scramble length. */
export const SCRAMBLE_LENGTH = 11;

const step = (idx: number, m: number) => {
  const p = (idx / N_TWIST) | 0;
  const t = idx - p * N_TWIST;
  return permMove![p * 9 + m] * N_TWIST + twistMove![t * 9 + m];
};

/**
 * A random solution of exactly `length` moves (no face turned twice in a
 * row), by depth-first search in random move order over the exact distance
 * table. Every state has one: God's number for <R, U, F> is 11.
 */
function exactSolution(idx: number, length: number): number[] | null {
  const path: number[] = [];
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const dfs = (i: number, togo: number, lastFace: number): boolean => {
    if (togo === 0) return i === 0;
    for (const m of shuffle(order.slice())) {
      const face = (m / 3) | 0;
      if (face === lastFace) continue;
      const j = step(i, m);
      if (dist![j] > togo - 1) continue;
      path.push(m);
      if (dfs(j, togo - 1, face)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(idx, length, -1) ? path : null;
}

/** Scramble (exactly SCRAMBLE_LENGTH moves) for a state index. */
function scrambleForIndex(idx: number): string {
  const sol = exactSolution(idx, SCRAMBLE_LENGTH) ?? solveIndex(idx);
  return sol
    .slice()
    .reverse()
    .map((m) => NAMES[inv(m)])
    .join(' ');
}

export function randomScramble(): string {
  init();
  for (;;) {
    const p = permToIndex(randPerm(7), 7);
    const t = randInt(N_TWIST);
    const idx = p * N_TWIST + t;
    if (dist![idx] < 4) continue;
    return scrambleForIndex(idx);
  }
}

/** For tests: does every state have an exact-length generator? Checks `n` random ones. */
export function _exactCoverage(n: number): number {
  init();
  let missing = 0;
  for (let k = 0; k < n; k++) {
    const idx = permToIndex(randPerm(7), 7) * N_TWIST + randInt(N_TWIST);
    if (!exactSolution(idx, SCRAMBLE_LENGTH)) missing++;
  }
  return missing;
}

/** Optimal move count for a scramble's state. For tests. */
export function distanceOf(scr: string): number {
  init();
  let idx = 0;
  for (const tok of scr.trim().split(/\s+/)) {
    const m = NAMES.indexOf(tok);
    if (m < 0) continue;
    const p = (idx / N_TWIST) | 0;
    const t = idx - p * N_TWIST;
    idx = permMove![p * 9 + m] * N_TWIST + twistMove![t * 9 + m];
  }
  return dist![idx];
}
