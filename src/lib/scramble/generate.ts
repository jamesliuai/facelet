/**
 * Scramble generation for every event. Runs inside the scramble worker
 * (the solvers build their tables on first use).
 */
import { randChoice, randInt, randPerm, permParity } from '../rand';
import * as Cubie from '../cube/cubie';
import { solveCube, solveShort, type AxisRestriction } from '../cube/twophase';
import * as Pyra from '../puzzles/pyraminx';
import * as Skewb from '../puzzles/skewb';
import * as Two from '../puzzles/cube222';
import * as Clock from '../puzzles/clock';
import * as Minx from '../puzzles/megaminx';
import * as Sq1 from '../puzzles/sq1';
import * as Sq1Solver from '../puzzles/sq1solver';
import { randomScramble444 } from '../puzzles/solver444';

// ------------------------------------------------------------------ NxN random move

const SUFFIX = ['', '2', "'"];

/** Random-move scramble: no repeated layer set within a run on one axis. */
export function randomMoves(axes: string[][], length: number): string {
  const out: string[] = [];
  let axis = -1;
  let used = new Set<number>();
  while (out.length < length) {
    const a = randInt(3);
    const m = randInt(axes[a].length);
    if (a === axis && used.has(m)) continue;
    if (a !== axis) {
      axis = a;
      used = new Set();
    }
    used.add(m);
    out.push(axes[a][m] + randChoice(SUFFIX));
  }
  return out.join(' ');
}

const AXES: Record<number, string[][]> = {
  2: [['U'], ['R'], ['F']],
  3: [['U', 'D'], ['R', 'L'], ['F', 'B']],
  4: [['U', 'D', 'Uw'], ['R', 'L', 'Rw'], ['F', 'B', 'Fw']],
  5: [['U', 'D', 'Uw', 'Dw'], ['R', 'L', 'Rw', 'Lw'], ['F', 'B', 'Fw', 'Bw']],
  6: [['U', 'D', 'Uw', 'Dw', '3Uw'], ['R', 'L', 'Rw', 'Lw', '3Rw'], ['F', 'B', 'Fw', 'Bw', '3Fw']],
  7: [['U', 'D', 'Uw', 'Dw', '3Uw', '3Dw'], ['R', 'L', 'Rw', 'Lw', '3Rw', '3Lw'], ['F', 'B', 'Fw', 'Bw', '3Fw', '3Bw']],
};
const RM_LEN: Record<number, number> = { 2: 11, 3: 25, 4: 40, 5: 60, 6: 80, 7: 100 };

export function nxnRandomMove(n: number, len = RM_LEN[n]): string {
  return randomMoves(AXES[n], len);
}

// ------------------------------------------------------------------ 3x3 random state & subsets

interface SubsetSpec {
  cperm: number[];
  cori: number[];
  eperm: number[];
  eori: number[];
}

const ALL8 = [0, 1, 2, 3, 4, 5, 6, 7];
const ALL12 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const U4 = [0, 1, 2, 3];

const SUBSETS: Record<string, SubsetSpec> = {
  f2l: { cperm: ALL8, cori: ALL8, eperm: [0, 1, 2, 3, 8, 9, 10, 11], eori: [0, 1, 2, 3, 8, 9, 10, 11] },
  lsll: { cperm: [0, 1, 2, 3, 4], cori: [0, 1, 2, 3, 4], eperm: [0, 1, 2, 3, 8], eori: [0, 1, 2, 3, 8] },
  ll: { cperm: U4, cori: U4, eperm: U4, eori: U4 },
  zbll: { cperm: U4, cori: U4, eperm: U4, eori: [] },
  oll: { cperm: [], cori: U4, eperm: [], eori: U4 },
  pll: { cperm: U4, cori: [], eperm: U4, eori: [] },
  cmll: { cperm: U4, cori: U4, eperm: [0, 1, 2, 3, 5, 7], eori: [0, 1, 2, 3, 5, 7] },
  l6e: { cperm: [], cori: [], eperm: [0, 1, 2, 3, 5, 7], eori: [0, 1, 2, 3, 5, 7] },
  eo: { cperm: ALL8, cori: ALL8, eperm: ALL12, eori: [] },
  eoline: { cperm: ALL8, cori: ALL8, eperm: [0, 1, 2, 3, 4, 6, 8, 9, 10, 11], eori: [] },
  corners: { cperm: ALL8, cori: ALL8, eperm: [], eori: [] },
  edges: { cperm: [], cori: [], eperm: ALL12, eori: ALL12 },
};

function permuteSubset(arr: number[], positions: number[]) {
  const shuffled = randPerm(positions.length).map((i) => arr[positions[i]]);
  positions.forEach((p, i) => (arr[p] = shuffled[i]));
}

function swap(arr: number[], i: number, j: number) {
  const t = arr[i];
  arr[i] = arr[j];
  arr[j] = t;
}

export function randomSubsetCube(spec: SubsetSpec): Cubie.Cubie {
  const c = Cubie.solved();
  permuteSubset(c.cp, spec.cperm);
  permuteSubset(c.ep, spec.eperm);
  if (permParity(c.cp) !== permParity(c.ep)) {
    if (spec.eperm.length >= 2) swap(c.ep, spec.eperm[0], spec.eperm[1]);
    else if (spec.cperm.length >= 2) swap(c.cp, spec.cperm[0], spec.cperm[1]);
  }
  if (spec.cori.length) {
    let s = 0;
    for (const p of spec.cori.slice(0, -1)) s += c.co[p] = randInt(3);
    c.co[spec.cori[spec.cori.length - 1]] = (3 - (s % 3)) % 3;
  }
  if (spec.eori.length) {
    let s = 0;
    for (const p of spec.eori.slice(0, -1)) s += c.eo[p] = randInt(2);
    c.eo[spec.eori[spec.eori.length - 1]] = s & 1;
  }
  return c;
}

/** A uniformly random 3x3 state that needs at least 2 moves (WCA 4b3). */
function random333State(): Cubie.Cubie {
  for (;;) {
    const c = Cubie.random();
    if (!Cubie.isSolved(c) && !Cubie.MOVES.some((m) => Cubie.equals(c, m))) return c;
  }
}

/**
 * WCA random-state 3x3 scramble. `restrict` bans an axis (0 U/D, 1 R/L,
 * 2 F/B) for the solution's first or last move; the state itself is never
 * redrawn, so every state stays equally likely.
 */
export function random333(restrict: AxisRestriction = {}): string {
  return Cubie.movesToString(Cubie.invertMoves(solveCube(random333State(), 21, restrict)));
}

export function subset333(id: string): string {
  if (id === '2gen') return twoGen(25);
  const spec = SUBSETS[id];
  if (!spec) return random333();
  for (;;) {
    const c = randomSubsetCube(spec);
    const sol = solveShort(c, 120);
    if (sol.length < 3) continue;
    return Cubie.movesToString(Cubie.invertMoves(sol));
  }
}

function twoGen(len: number): string {
  const out: string[] = [];
  let last = '';
  for (let i = 0; i < len; i++) {
    const f = last === 'R' ? 'U' : last === 'U' ? 'R' : randChoice(['R', 'U']);
    out.push(f + randChoice(SUFFIX));
    last = f;
  }
  return out.join(' ');
}

const BLD_A = ['', 'Rw', 'Rw2', "Rw'", 'Fw', "Fw'"];
const BLD_B = ['', 'Uw', 'Uw2', "Uw'"];
const AXIS_OF_FACE: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

function withOrientation(scr: string, a: string[], b: string[]): string {
  return [scr, randChoice(a), randChoice(b)].filter(Boolean).join(' ');
}

/**
 * 3BLD / MBLD (TNoodle): a random state, then a random orientation with wide
 * moves. The solver keeps the scramble's last move off the axis of the first
 * orientation move, so the two never run together.
 */
export function bld333(): string {
  const orient = [randChoice(BLD_A), randChoice(BLD_B)].filter(Boolean);
  const restrict = orient.length ? { firstAxis: AXIS_OF_FACE[orient[0][0]] } : {};
  return [random333(restrict), ...orient].join(' ');
}

const FMC_PAD = Cubie.parseMoves("R' U' F");

/**
 * FMC (TNoodle): R' U' F + scramble + R' U' F for a uniformly random final
 * state. The middle part may not start on the F/B axis (after the leading F)
 * nor end on the R/L axis (before the trailing R'); the solver is told so
 * instead of redrawing states, which would make some states unreachable.
 */
export function fmc333(): string {
  const P = Cubie.applyMoves(Cubie.solved(), FMC_PAD);
  const Pinv = Cubie.invert(P);
  const X = random333State();
  // We need P * S * P = X, so S = P^-1 * X * P^-1. The scramble's middle is
  // the inverse of S's solution: its first move inverts the solution's last.
  const S = Cubie.multiply(Cubie.multiply(Pinv, X), Pinv);
  const sMoves = Cubie.invertMoves(solveCube(S, 21, { firstAxis: 1, lastAxis: 2 }));
  return `R' U' F ${Cubie.movesToString(sMoves)} R' U' F`;
}

// ------------------------------------------------------------------ dispatcher

export function generate(event: string, type = 'wca'): string {
  switch (event) {
    case '333':
    case '333oh':
      if (type === 'rm') return nxnRandomMove(3);
      if (type !== 'wca') return subset333(type);
      return random333();
    case '333bf':
    case '333mbf':
      return bld333();
    case '333fm':
      return fmc333();
    case '222':
      return type === 'rm' ? nxnRandomMove(2) : Two.randomScramble();
    case '444':
    case 'v444':
      return randomScramble444();
    case '555':
      return nxnRandomMove(5);
    case '666':
      return nxnRandomMove(6);
    case '777':
      return nxnRandomMove(7);
    case '444bf':
      // TNoodle turns all four layers for 4BLD, i.e. whole-cube rotations.
      return withOrientation(randomScramble444(), ['', 'x', 'x2', "x'", 'z', "z'"], ['', 'y', 'y2', "y'"]);
    case '555bf':
      return withOrientation(nxnRandomMove(5), ['', '3Rw', '3Rw2', "3Rw'", '3Fw', "3Fw'"], ['', '3Uw', '3Uw2', "3Uw'"]);
    case 'clock':
      return Clock.randomScramble();
    case 'minx':
      return Minx.randomScramble();
    case 'pyram':
      return Pyra.randomScramble();
    case 'skewb':
      return Skewb.randomScramble();
    case 'sq1':
      return type === 'rm' ? Sq1.randomMoveScramble(20) : Sq1Solver.randomStateScramble();
    case 'v222':
      return Two.randomScramble();
    case 'v333':
      return random333();
    case 'v555':
      return nxnRandomMove(5);
    default:
      return random333();
  }
}
