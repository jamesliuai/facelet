/**
 * Rubik's Clock: WCA-notation random-state scrambles (12g) and a dial
 * simulator for scramble images.
 *
 * Dials are stored as front[9] then back[9], row-major as seen from each
 * side. Corner dials are shared gears: front corner 0 is back corner 2
 * (mirrored), 2↔0, 6↔8, 8↔6, and turn in opposite directions.
 */
import { randChoice } from '../rand';

const AMOUNTS = ['0+', '1+', '2+', '3+', '4+', '5+', '6+', '1-', '2-', '3-', '4-', '5-'];
const FRONT_MOVES = ['UR', 'DR', 'DL', 'UL', 'U', 'R', 'D', 'L', 'ALL'];
const BACK_MOVES = ['U', 'R', 'D', 'L', 'ALL'];

export function randomScramble(): string {
  const parts: string[] = [];
  for (const m of FRONT_MOVES) parts.push(m + randChoice(AMOUNTS));
  parts.push('y2');
  for (const m of BACK_MOVES) parts.push(m + randChoice(AMOUNTS));
  return parts.join(' ');
}

const PIN_BLOCKS: Record<string, number[]> = {
  UL: [0, 1, 3, 4],
  UR: [1, 2, 4, 5],
  DL: [3, 4, 6, 7],
  DR: [4, 5, 7, 8],
};
const PIN_SETS: Record<string, string[]> = {
  UR: ['UR'], DR: ['DR'], DL: ['DL'], UL: ['UL'],
  U: ['UL', 'UR'], R: ['UR', 'DR'], D: ['DL', 'DR'], L: ['UL', 'DL'],
  ALL: ['UL', 'UR', 'DL', 'DR'],
};
const MIRROR: Record<number, number> = { 0: 2, 2: 0, 6: 8, 8: 6 };

export interface ClockState {
  dials: number[]; // 18 values 0..11
  /** pins as seen from the front: UL UR DL DR, true = up */
  pins: boolean[];
}

export function solvedClock(): ClockState {
  return { dials: new Array(18).fill(0), pins: [false, false, false, false] };
}

export function applyScramble(scr: string): ClockState {
  const st = solvedClock();
  let flipped = false;
  for (const tok of scr.trim().split(/\s+/)) {
    if (tok === 'y2') {
      flipped = !flipped;
      continue;
    }
    const m = /^(UR|DR|DL|UL|U|R|D|L|ALL)(\d)([+-])$/.exec(tok);
    if (!m) continue;
    const amt = (parseInt(m[2], 10) * (m[3] === '+' ? 1 : -1) + 12) % 12;
    const front = flipped ? 9 : 0;
    const back = flipped ? 0 : 9;
    const moved = new Set<number>();
    for (const pin of PIN_SETS[m[1]]) for (const d of PIN_BLOCKS[pin]) moved.add(d);
    for (const d of moved) {
      st.dials[front + d] = (st.dials[front + d] + amt) % 12;
      if (d in MIRROR) {
        const b = back + MIRROR[d];
        st.dials[b] = (st.dials[b] - amt + 12) % 12;
      }
    }
  }
  // After a WCA scramble every pin is down (Regulation 12g3+).
  return st;
}
