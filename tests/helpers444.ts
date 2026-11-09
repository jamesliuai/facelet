import { StickerCube, ROTATIONS } from '../src/lib/cube/nxn';

const WCA_MOVE = /^(U|D|L|R|F|B|Uw|Rw|Fw)(2|')?$/;
const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

/** Does `scr` (applied to a solved 4x4x4) give `target` up to a whole-cube rotation? */
export function reproduces(scr: string, target: Uint8Array): boolean {
  const c = new StickerCube(4).apply(scr);
  return ROTATIONS.some((r) => {
    const d = c.clone().apply(r);
    return d.s.every((v, i) => v === target[i]);
  });
}

/** WCA notation only, and no layer turned twice within one run of same-axis moves. */
export function wellFormed(scr: string): boolean {
  const moves = scr.split(' ');
  if (!moves.every((m) => WCA_MOVE.test(m))) return false;
  let run: string[] = [];
  for (const m of moves) {
    const layer = m.replace(/[2']/g, '');
    if (run.length && AXIS[run[0][0]] !== AXIS[m[0]]) run = [];
    if (run.includes(layer)) return false;
    run.push(layer);
  }
  return true;
}

/** Cheaper search settings for bulk correctness checks (same code paths). */
export const FAST = { weight: 1.3, candidates: 3, p1Max: 60 };
