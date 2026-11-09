import { describe, expect, it } from 'vitest';
import * as C from '../src/lib/cube/cubie';
import { solver, scrambleFor, solveShort } from '../src/lib/cube/twophase';

describe('cubie model', () => {
  it('face moves have order 4', () => {
    for (let f = 0; f < 6; f++) {
      let c = C.solved();
      for (let i = 0; i < 4; i++) c = C.applyMove(c, f * 3);
      expect(C.isSolved(c)).toBe(true);
    }
  });

  it('sexy move has order 6', () => {
    const seq = C.parseMoves("R U R' U'");
    let c = C.solved();
    for (let i = 0; i < 5; i++) c = C.applyMoves(c, seq);
    expect(C.isSolved(c)).toBe(false);
    c = C.applyMoves(c, seq);
    expect(C.isSolved(c)).toBe(true);
  });

  it('inverse and invertMoves agree', () => {
    const seq = C.parseMoves("R U2 F' L D B2 R' U F2");
    const a = C.applyMoves(C.solved(), seq);
    const b = C.applyMoves(C.solved(), C.invertMoves(seq));
    expect(C.equals(C.invert(a), b)).toBe(true);
    expect(C.isSolved(C.multiply(a, C.invert(a)))).toBe(true);
  });

  it('facelets round-trip', () => {
    const f = C.toFacelets(C.solved());
    for (let i = 0; i < 54; i++) expect(f[i]).toBe(Math.floor(i / 9));
    for (let k = 0; k < 50; k++) {
      const c = C.random();
      expect(C.isValid(c)).toBe(true);
      const back = C.fromFacelets(C.toFacelets(c));
      expect(back && C.equals(back, c)).toBe(true);
    }
  });

  it('R moves the expected stickers (F right column goes to U)', () => {
    const f = C.toFacelets(C.applyMoves(C.solved(), C.parseMoves('R')));
    // U3, U6, U9 now show F colour (2)
    expect([f[2], f[5], f[8]]).toEqual([2, 2, 2]);
    // F3, F6, F9 now show D colour (3)
    expect([f[20], f[23], f[26]]).toEqual([3, 3, 3]);
  });
});

describe('two-phase solver', () => {
  it('solves random cubes in at most 21 moves', () => {
    const s = solver();
    const t0 = Date.now();
    s.init();
    const tInit = Date.now() - t0;
    const lens: number[] = [];
    const t1 = Date.now();
    for (let k = 0; k < 40; k++) {
      const c = C.random();
      const sol = s.solve(c, 21, 5000);
      expect(sol).not.toBeNull();
      expect(C.isSolved(C.applyMoves(c, sol!))).toBe(true);
      lens.push(sol!.length);
    }
    const per = (Date.now() - t1) / 40;
    process.stdout.write(`\n[two-phase] init ${tInit}ms, avg solve ${per.toFixed(1)}ms, lengths ${Math.min(...lens)}-${Math.max(...lens)}\n`);
    expect(Math.max(...lens)).toBeLessThanOrEqual(21);
  });

  it('scrambleFor produces the state', () => {
    for (let k = 0; k < 10; k++) {
      const c = C.random();
      const scr = scrambleFor(c);
      expect(C.equals(C.applyMoves(C.solved(), scr), c)).toBe(true);
    }
  });

  it('handles solved and one-move states', () => {
    expect(solver().solve(C.solved(), 21)).toEqual([]);
    const r = solveShort(C.applyMoves(C.solved(), [3]), 300);
    expect(r.length).toBe(1);
    const t = solveShort(C.applyMoves(C.solved(), C.parseMoves("R U R' U' R' F R2 U' R' U' R U R' F'")), 400);
    expect(t.length).toBeLessThanOrEqual(15);
  });
});
