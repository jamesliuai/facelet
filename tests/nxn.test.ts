import { describe, expect, it } from 'vitest';
import * as C from '../src/lib/cube/cubie';
import { StickerCube, ROTATIONS, cubieFromAlg } from '../src/lib/cube/nxn';
import { parseAlg, invertAlg, countMoves, algToString } from '../src/lib/cube/alg';

const same = (a: string, b: string, n = 3) =>
  expect(Array.from(new StickerCube(n).apply(a).s)).toEqual(Array.from(new StickerCube(n).apply(b).s));

describe('notation parser', () => {
  it('expands groups, commutators and conjugates', () => {
    expect(algToString(parseAlg("(R U)2 [F: R] [R, U]"))).toBe("R U R U F R F' R U R' U'");
    expect(algToString(parseAlg("(R U R' U')3'"))).toBe("U R U' R' U R U' R' U R U' R'");
  });
  it('handles wide, slice and prefix notation', () => {
    const t = parseAlg("3Rw r 2R Rw2 M' x2 U2'");
    expect(t.map((x) => x.kind)).toEqual(['wide', 'wide', 'slice', 'wide', 'mid', 'rot', 'face']);
    expect(t[0].depth).toBe(3);
  });
  it('inverts', () => {
    expect(invertAlg("R U2 F' 3Rw")).toBe("3Rw' F U2 R'");
  });
  it('counts moves', () => {
    expect(countMoves("R U R' U' M2 x")).toEqual({ htm: 6, qtm: 8, stm: 5, etm: 6 });
  });
});

describe('sticker cube', () => {
  it('matches the cubie model for face moves', () => {
    const faces = 'URFDLB';
    for (let k = 0; k < 30; k++) {
      let alg = '';
      for (let i = 0; i < 25; i++) alg += faces[Math.floor(Math.random() * 6)] + ["", "2", "'"][Math.floor(Math.random() * 3)] + ' ';
      const s = new StickerCube(3).apply(alg);
      const f = C.toFacelets(C.applyMoves(C.solved(), C.parseMoves(alg)));
      expect(Array.from(s.s)).toEqual(f);
    }
  });
  it('slice and rotation identities', () => {
    same('M', "R L' x'");
    same('E', "U D' y'");
    same('S', "F' B z");
    same('r', "R M'");
    same('x', "R M' L'");
    same('Rw', 'R 2R', 4);
    same('3Rw', 'R 2R 3R', 5);
    same('x', "R 2R 3R L'", 4);
  });
  it('has 24 rotations', () => {
    expect(ROTATIONS.length).toBe(24);
  });
  it('normalises rotated algorithms to cubie states', () => {
    const a = cubieFromAlg("x R U R' U' x'")!;
    const b = C.applyMoves(C.solved(), C.parseMoves("R F R' F'"));
    expect(C.equals(a, b)).toBe(true);
    // T-perm with M slices
    const ua = cubieFromAlg("M2 U M U2 M' U M2")!;
    expect(ua).not.toBeNull();
    expect(C.isSolved(C.applyMoves(ua, C.parseMoves("R U' R U R U R U' R' U' R2")))).toBe(false);
  });
  it('wide moves work for big cubes', () => {
    for (const n of [2, 4, 5, 6, 7]) {
      const c = new StickerCube(n).apply("Rw U2 3Fw' Dw L2 B 3Uw2");
      c.apply(invertAlg("Rw U2 3Fw' Dw L2 B 3Uw2"));
      expect(c.isSolved()).toBe(true);
    }
  });
});
