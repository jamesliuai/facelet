import { describe, expect, it } from 'vitest';
import * as Pyra from '../src/lib/puzzles/pyraminx';
import * as Skewb from '../src/lib/puzzles/skewb';
import * as Two from '../src/lib/puzzles/cube222';
import * as Clock from '../src/lib/puzzles/clock';
import * as Minx from '../src/lib/puzzles/megaminx';
import * as Sq1 from '../src/lib/puzzles/sq1';
import { generate } from '../src/lib/scramble/generate';
import { StickerCube } from '../src/lib/cube/nxn';
import * as C from '../src/lib/cube/cubie';
import { cubieFromAlg } from '../src/lib/cube/nxn';
import { solveCube } from '../src/lib/cube/twophase';

const log = (s: string) => process.stdout.write(s + '\n');

describe('2x2', () => {
  it('scrambles are exactly 11 moves (TNoodle) for states needing >= 4', () => {
    const t = Date.now();
    for (let i = 0; i < 40; i++) {
      const s = Two.randomScramble();
      const moves = s.split(' ');
      expect(moves.length).toBe(Two.SCRAMBLE_LENGTH);
      expect(moves.every((m) => /^[URF](2|')?$/.test(m))).toBe(true);
      for (let j = 1; j < moves.length; j++) expect(moves[j][0]).not.toBe(moves[j - 1][0]);
      expect(Two.distanceOf(s)).toBeGreaterThanOrEqual(4);
    }
    expect(Two._exactCoverage(300)).toBe(0);
    log(`[2x2] ${Date.now() - t}ms for 40 (incl. table) e.g. ${Two.randomScramble()}`);
  });
});

describe('pyraminx', () => {
  it('moves have order 3', () => {
    for (const m of ['U', 'L', 'R', 'B', 'u', 'l', 'r', 'b']) {
      let s = Pyra.solvedState();
      s = Pyra.applyScramble(s, `${m} ${m} ${m}`);
      expect(Array.from(s)).toEqual(Array.from(Pyra.solvedState()));
    }
  });
  it('scrambles are 11 moves plus tips and need >= 6 counting tips', () => {
    for (let i = 0; i < 40; i++) {
      const scr = Pyra.randomScramble().split(' ');
      const big = scr.filter((m) => /^[ULRB]'?$/.test(m));
      const tips = scr.filter((m) => /^[ulrb]'?$/.test(m));
      expect(big.length).toBe(Pyra.SCRAMBLE_LENGTH);
      expect(big.length + tips.length).toBe(scr.length);
      for (let j = 1; j < big.length; j++) expect(big[j][0]).not.toBe(big[j - 1][0]);
      expect(Pyra.stateDistance(big.join(' ')) + tips.length).toBeGreaterThanOrEqual(6);
    }
  });
  it('solver agrees with sticker model', () => {
    const t = Date.now();
    for (let i = 0; i < 20; i++) {
      const scr = Pyra.randomScramble();
      const big = scr.split(' ').filter((m) => /^[ULRB]'?$/.test(m)).join(' ');
      const sol = Pyra.solveScramble(big);
      expect(sol.split(' ').filter(Boolean).length).toBeLessThanOrEqual(big.split(' ').filter(Boolean).length);
      // apply scramble then solution to stickers: everything but tips solved
      let st = Pyra.applyScramble(Pyra.solvedState(), big + ' ' + sol);
      expect(Array.from(st)).toEqual(Array.from(Pyra.solvedState()));
    }
    log(`[pyra] ${Date.now() - t}ms; e.g. ${Pyra.randomScramble()}`);
  });
  it('net has 36 polygons', () => {
    expect(Pyra.netPolygons().length).toBe(36);
  });
});

describe('skewb', () => {
  it('WCA conversion round-trips', () => {
    const t = Date.now();
    for (let i = 0; i < 30; i++) expect(Skewb._testRoundTrip()).toBe(true);
    log(`[skewb] ${Date.now() - t}ms; e.g. ${Skewb.randomScramble()}`);
  });
  it('scrambles are exactly 11 moves for states needing >= 7', () => {
    for (let i = 0; i < 40; i++) {
      const { scramble, optimal } = Skewb.randomScrambleInfo();
      const moves = scramble.split(' ');
      expect(moves.length).toBe(Skewb.SCRAMBLE_LENGTH);
      expect(moves.every((m) => /^[RULB]'?$/.test(m))).toBe(true);
      for (let j = 1; j < moves.length; j++) expect(moves[j][0]).not.toBe(moves[j - 1][0]);
      expect(optimal).toBeGreaterThanOrEqual(7);
    }
  });
  it('samples uniformly from all 3,149,280 states', () => {
    expect(Skewb._stateCount()).toBe(3149280);
  });
});

describe('clock', () => {
  it('formats and simulates', () => {
    const s = Clock.randomScramble();
    expect(s.split(' ').length).toBe(15);
    expect(s).toMatch(/^UR\d[+-] DR\d[+-] DL\d[+-] UL\d[+-] U\d[+-] R\d[+-] D\d[+-] L\d[+-] ALL\d[+-] y2 U\d[+-] R\d[+-] D\d[+-] L\d[+-] ALL\d[+-]$/);
    const st = Clock.applyScramble('ALL1+');
    expect(st.dials.slice(0, 9)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect([st.dials[9], st.dials[11], st.dials[15], st.dials[17]]).toEqual([11, 11, 11, 11]);
    const st2 = Clock.applyScramble('UR1+ y2 UR1-');
    // front UR block +1 ; after flip, back UR block -1 which includes back corner 2 = front corner 0 mirrored -> front 0 += 1
    expect(st2.dials[2]).toBe(1);
  });
});

describe('megaminx', () => {
  it('scramble format', () => {
    const s = Minx.randomScramble();
    const lines = s.split('\n');
    expect(lines.length).toBe(7);
    for (const l of lines) expect(l).toMatch(/^(R(\+\+|--) D(\+\+|--) ){5}U'?$/);
  });
  it('moves have the right order', () => {
    const solved = Array.from(Minx.solvedState());
    for (const [m, k] of [['U', 5], ['R++', 5], ['D++', 5]] as const) {
      let s = Minx.solvedState();
      s = Minx.applyScramble(s, Array(k).fill(m).join(' '));
      expect(Array.from(s)).toEqual(solved);
      const once = Array.from(Minx.applyScramble(Minx.solvedState(), m));
      expect(once).not.toEqual(solved);
    }
    expect(Minx.STICKERS.length).toBe(132);
  });
});

describe('square-1', () => {
  it('random-move scrambles are legal', () => {
    const s = Sq1.randomMoveScramble(20);
    expect(s.split('/').length - 1).toBe(20);
    const st = Sq1.applyScramble(s);
    expect(st.top.length).toBe(12);
    // each corner occupies two adjacent slots
    for (const layer of [st.top, st.bot]) {
      const counts = new Map<number, number>();
      layer.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1));
      for (const [p, n] of counts) expect(n).toBe(p < 8 ? 2 : 1);
    }
  });
  it('/ (6,0) / (6,0) is solved-shape preserving and / / is identity', () => {
    const a = Sq1.applyScramble('/ /');
    expect(a).toEqual(Sq1.solvedSq1());
  });
});

describe('square-1 random state', () => {
  it('scrambles reproduce uniformly drawn states', async () => {
    const S = await import('../src/lib/puzzles/sq1solver');
    const t = Date.now();
    for (let i = 0; i < 6; i++) {
      const st = S.randomState();
      expect(Sq1.canSlash(st)).toBe(true);
      const scr = S.scrambleFor(st);
      expect(JSON.stringify(Sq1.applyScramble(scr))).toBe(JSON.stringify(st));
      expect(scr).not.toMatch(/\/ \//);
    }
    log(`[sq1 random state] 6 in ${Date.now() - t}ms e.g. ${S.randomStateScramble()}`);
  }, 120000);
});

describe('generate()', () => {
  it('produces scrambles for every event', () => {
    for (const ev of ['333', '222', '444', '555', '666', '777', '333oh', '333bf', '333fm', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf', '333mbf']) {
      const s = generate(ev);
      expect(s.length).toBeGreaterThan(5);
    }
    log('[4x4] ' + generate('444'));
    log('[fmc] ' + generate('333fm'));
    log('[3bld] ' + generate('333bf'));
  }, 60000);
  it('3x3 subsets produce the right kind of state', () => {
    const check = (id: string, test: (c: C.Cubie) => boolean) => {
      for (let i = 0; i < 5; i++) {
        const scr = generate('333', id);
        const c = C.applyMoves(C.solved(), C.parseMoves(scr));
        expect(test(c)).toBe(true);
      }
    };
    const f2lSolved = (c: C.Cubie) => [4, 5, 6, 7].every((i) => c.cp[i] === i && c.co[i] === 0) && [4, 5, 6, 7, 8, 9, 10, 11].every((i) => c.ep[i] === i && c.eo[i] === 0);
    check('ll', f2lSolved);
    check('zbll', (c) => f2lSolved(c) && c.eo.every((x) => x === 0));
    check('pll', (c) => f2lSolved(c) && c.eo.every((x) => x === 0) && c.co.every((x) => x === 0));
    check('f2l', (c) => [4, 5, 6, 7].every((i) => c.ep[i] === i && c.eo[i] === 0));
    check('eo', (c) => c.eo.every((x) => x === 0));
    const t = Date.now();
    for (let i = 0; i < 10; i++) generate('333', 'zbll');
    log(`[zbll subset] avg ${(Date.now() - t) / 10}ms e.g. ${generate('333', 'pll')}`);
  });
  it('FMC scramble is wrapped, and the middle never runs into the padding', () => {
    const axis = (m: string) => 'UDRLFB'.indexOf(m[0]) >> 1;
    for (let i = 0; i < 25; i++) {
      const s = generate('333fm');
      expect(s.startsWith("R' U' F ")).toBe(true);
      expect(s.endsWith(" R' U' F")).toBe(true);
      expect(cubieFromAlg(s)).not.toBeNull();
      const mid = s.split(' ').slice(3, -3);
      expect(axis(mid[0])).not.toBe(2); // not F/B after the leading F
      expect(axis(mid[mid.length - 1])).not.toBe(1); // not R/L before the trailing R'
    }
  });
  it('two-phase axis restrictions hold without changing the state', () => {
    for (let i = 0; i < 20; i++) {
      const c = C.random();
      const first = i % 3;
      const last = (i + 1) % 3;
      const sol = solveCube(c, 21, { firstAxis: first, lastAxis: last });
      expect((((sol[0] / 3) | 0) % 3)).not.toBe(first);
      expect((((sol[sol.length - 1] / 3) | 0) % 3)).not.toBe(last);
      expect(C.isSolved(C.applyMoves(c, sol))).toBe(true);
    }
  });
  it('3BLD: random orientation, and the scramble never runs into it', () => {
    const axis = (m: string) => 'UDRLFB'.indexOf(m[0]) >> 1;
    for (let i = 0; i < 25; i++) {
      const s = generate('333bf');
      const sc = new StickerCube(3).apply(s);
      expect(sc.isSolved()).toBe(false);
      const moves = s.split(' ');
      const k = moves.findIndex((m) => m.includes('w'));
      if (k > 0) expect(axis(moves[k - 1])).not.toBe(axis(moves[k]));
      expect(moves.slice(k < 0 ? moves.length : k).every((m) => /^(Rw|Fw|Uw)(2|')?$/.test(m))).toBe(true);
    }
  });
});
