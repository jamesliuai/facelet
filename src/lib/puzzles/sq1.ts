/**
 * Square-1 state model, notation (WCA 12c) and scramble images.
 *
 * Each layer is 12 slots of 30°. Corners (ids 0-7) fill two consecutive slots,
 * edges (ids 8-15) fill one. Top slots run clockwise seen from above starting
 * at the front cut; bottom slots run clockwise seen from below starting at the
 * same cut. "/" swaps top[6..11] with bottom[0..5] and flips the middle.
 */
import { randInt } from '../rand';

export interface Sq1State {
  top: number[];
  bot: number[];
  midFlipped: boolean;
}

export function solvedSq1(): Sq1State {
  return {
    top: [0, 0, 8, 1, 1, 9, 2, 2, 10, 3, 3, 11],
    bot: [12, 4, 4, 13, 5, 5, 14, 6, 6, 15, 7, 7],
    midFlipped: false,
  };
}

export const isCorner = (p: number) => p < 8;

function turn(layer: number[], k: number): number[] {
  const n = ((k % 12) + 12) % 12;
  const out = new Array<number>(12);
  for (let i = 0; i < 12; i++) out[(i + n) % 12] = layer[i];
  return out;
}

export function canSlash(s: Sq1State): boolean {
  return s.top[5] !== s.top[6] && s.top[11] !== s.top[0] && s.bot[11] !== s.bot[0] && s.bot[5] !== s.bot[6];
}

export function slash(s: Sq1State): Sq1State {
  const top = s.top.slice();
  const bot = s.bot.slice();
  for (let k = 0; k < 6; k++) {
    top[6 + k] = s.bot[k];
    bot[k] = s.top[6 + k];
  }
  return { top, bot, midFlipped: !s.midFlipped };
}

export function twist(s: Sq1State, x: number, y: number): Sq1State {
  return { top: turn(s.top, x), bot: turn(s.bot, y), midFlipped: s.midFlipped };
}

export function applyScramble(scr: string, start = solvedSq1()): Sq1State {
  let s = start;
  const re = /\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)|\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scr))) {
    if (m[0] === '/') {
      if (canSlash(s)) s = slash(s);
    } else s = twist(s, parseInt(m[1], 10), parseInt(m[2], 10));
  }
  return s;
}

const fmt = (n: number) => (n > 6 ? n - 12 : n);

/** Random-move scramble with `slashes` slices; every twist leaves a legal slice. */
export function randomMoveScramble(slashes = 20): string {
  let s = solvedSq1();
  const parts: string[] = [];
  for (let i = 0; i < slashes; i++) {
    for (;;) {
      const x = randInt(12);
      const y = randInt(12);
      if (x === 0 && y === 0 && i > 0) continue;
      const t = twist(s, x, y);
      if (!canSlash(t)) continue;
      if (x !== 0 || y !== 0) parts.push(`(${fmt(x)},${fmt(y)})`);
      s = slash(t);
      parts.push('/');
      break;
    }
  }
  return parts.join(' ');
}

// ------------------------------------------------------------------ colours

/** Side colours per piece (face indices: 0 U, 1 R, 2 F, 3 D, 4 L, 5 B). */
export const PIECE_SIDES: number[][] = [
  [2, 4], [4, 5], [5, 1], [1, 2], // top corners: FL, BL, BR, FR (first half, second half)
  [2, 1], [1, 5], [5, 4], [4, 2], // bottom corners: FR, BR, BL, FL
  [4], [5], [1], [2], // top edges: L, B, R, F
  [2], [1], [5], [4], // bottom edges: F, R, B, L
];
export const pieceTop = (p: number) => ((p < 4 || (p >= 8 && p < 12)) ? 0 : 3);
