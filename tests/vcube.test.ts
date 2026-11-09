import { describe, expect, it } from 'vitest';
import { CubeModel } from '../src/lib/vcube/model';
import { StickerCube } from '../src/lib/cube/nxn';
import { parseAlg, resolve } from '../src/lib/cube/alg';

describe('virtual cube model', () => {
  it('matches the sticker simulator for random algorithms', () => {
    for (const n of [2, 3, 4, 5]) {
      for (let k = 0; k < 10; k++) {
        const toks = ['R', "U'", 'F2', 'L', 'D', "B'", 'Rw', 'x', "y'", 'z2', 'M', 'E', 'S', '3Rw', '2R', 'u'];
        const alg = Array.from({ length: 30 }, () => toks[Math.floor(Math.random() * toks.length)]).join(' ');
        const m = new CubeModel(n);
        for (const t of parseAlg(alg)) {
          const mv = resolve(t, n);
          if (mv) m.apply(mv);
        }
        const s = new StickerCube(n).apply(alg);
        expect(Array.from(m.facelets())).toEqual(Array.from(s.s));
        expect(m.isSolved()).toBe(s.isSolved());
      }
    }
  });
  it('detects solved after rotations', () => {
    const m = new CubeModel(3);
    for (const t of parseAlg("x y2 z'")) m.apply(resolve(t, 3)!);
    expect(m.isSolved()).toBe(true);
    m.apply(resolve(parseAlg('R')[0], 3)!);
    expect(m.isSolved()).toBe(false);
  });
});
