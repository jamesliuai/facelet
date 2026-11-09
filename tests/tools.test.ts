import { describe, expect, it } from 'vitest';
import { runTool } from '../src/lib/tools/blocks';
import { generate } from '../src/lib/scramble/generate';
import { StickerCube } from '../src/lib/cube/nxn';
import { caseScramble } from '../src/lib/trainer/setup';
import * as C from '../src/lib/cube/cubie';
import { cubieFromAlg } from '../src/lib/cube/nxn';
import { invertAlg } from '../src/lib/cube/alg';

const log = (s: string) => process.stdout.write(s + '\n');

function crossSolved(sc: StickerCube): boolean {
  // D face (index 3): edge stickers 1,3,5,7 match centre; side edge stickers row 2 col 1 match their centres
  const s = sc.s;
  const D = 27;
  if (![1, 3, 5, 7].every((k) => s[D + k] === s[D + 4])) return false;
  for (const f of [1, 2, 4, 5]) if (s[f * 9 + 7] !== s[f * 9 + 4]) return false;
  return true;
}

describe('block tools', () => {
  it('cross solutions solve the cross for every colour', () => {
    const t = Date.now();
    for (let k = 0; k < 5; k++) {
      const scr = generate('333');
      const res = runTool('cross', scr, { limit: 2 });
      expect(res.rows.length).toBe(6);
      for (const row of res.rows) {
        expect(row.length).toBeGreaterThanOrEqual(0);
        expect(row.length).toBeLessThanOrEqual(8);
        for (const sol of row.solutions) {
          const sc = new StickerCube(3).apply(scr).apply(row.rotation).apply(sol);
          expect(crossSolved(sc)).toBe(true);
        }
      }
    }
    log(`[cross] 5 scrambles x 6 colours in ${Date.now() - t}ms`);
  });
  it('xcross, eoline, roux and 2x2x2 return solutions', () => {
    const scr = generate('333');
    for (const tool of ['xcross', 'eoline', 'roux', '222']) {
      const t = Date.now();
      const res = runTool(tool, scr, { colour: 0, limit: 1 });
      expect(res.rows.length).toBeGreaterThan(0);
      expect(res.rows[0].solutions.length).toBe(1);
      log(`[${tool}] best ${res.rows[0].length} moves (${res.rows[0].label}) in ${Date.now() - t}ms: ${res.rows[0].rotation} ${res.rows[0].solutions[0]}`);
    }
  });
});

describe('trainer setup', () => {
  it('scramble reproduces the case up to AUF/filler', () => {
    // T-perm case: inverse of the alg applied to solved
    const alg = "R U R' U' R' F R2 U' R' U' R U R' F'";
    const state = cubieFromAlg(invertAlg(alg))!;
    const scr = caseScramble(state, { filler: 'auf', preAuf: true });
    const c = C.applyMoves(C.solved(), C.parseMoves(scr));
    // solving: some U^k, then alg, then some U^j gives solved
    let ok = false;
    for (let a = 0; a < 4 && !ok; a++) for (let b = 0; b < 4 && !ok; b++) {
      const seq = [...Array(a).fill(0), ...C.parseMoves(alg), ...Array(b).fill(0)];
      if (C.isSolved(C.applyMoves(c, seq))) ok = true;
    }
    expect(ok).toBe(true);
  });
});
