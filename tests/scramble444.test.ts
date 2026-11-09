import { describe, expect, it } from 'vitest';
import * as M from '../src/lib/puzzles/cube444';
import { init444, scrambleFor444, solve444, stats, toWcaMoves, outToString } from '../src/lib/puzzles/solver444';
import { edgeTables } from '../src/lib/puzzles/edge444';
import { StickerCube } from '../src/lib/cube/nxn';
import { FAST, reproduces, wellFormed } from './helpers444';
import { generate } from '../src/lib/scramble/generate';
import { randInt } from '../src/lib/rand';

const log = (s: string) => process.stdout.write(s + '\n');
describe('4x4x4 piece model', () => {
  it('matches the sticker cube for every move', () => {
    for (let i = 0; i < 40; i++) {
      const s = M.random444();
      const st = M.render444(s);
      for (let m = 0; m < M.N_MOVES; m++) {
        const a = M.render444(M.applyMove444(s, m));
        const b = new StickerCube(4, st).move(M.moveSpec(m)).s;
        expect(Array.from(a)).toEqual(Array.from(b));
      }
    }
    for (let m = 0; m < M.N_MOVES; m++) {
      expect(Array.from(new StickerCube(4).apply(M.moveName(m)).s)).toEqual(Array.from(new StickerCube(4).move(M.moveSpec(m)).s));
    }
  });

  it('phase-3 moves keep two wing classes of one wing per edge', () => {
    const E = edgeTables();
    for (let e = 0; e < 12; e++) expect(E.cls[e]).not.toBe(E.cls[e + 12]);
    expect(E.nsym).toBe(1538);
  });

  it('rewrites Dw/Lw/Bw as Uw/Rw/Fw plus a rotation', () => {
    for (let i = 0; i < 200; i++) {
      const seq = Array.from({ length: 25 }, () => randInt(M.N_MOVES));
      const target = M.render444(M.applyMoves444(M.solved444(), seq));
      const scr = outToString(toWcaMoves(seq));
      expect(wellFormed(scr)).toBe(true);
      expect(reproduces(scr, target)).toBe(true);
    }
  });

  it('samples every piece uniformly (sanity check)', () => {
    const n = 4000;
    let odd = 0;
    const cornerAt0 = new Array<number>(8).fill(0);
    const colourAt0 = new Array<number>(6).fill(0);
    for (let i = 0; i < n; i++) {
      const s = M.random444();
      let p = 0;
      const seen = new Uint8Array(24);
      for (let j = 0; j < 24; j++) {
        if (seen[j]) continue;
        let len = 0;
        for (let k = j; !seen[k]; k = s.wp[k]) {
          seen[k] = 1;
          len++;
        }
        p ^= (len - 1) & 1;
      }
      odd += p;
      cornerAt0[s.corners.cp[0]]++;
      colourAt0[s.ct[0]]++;
    }
    expect(Math.abs(odd / n - 0.5)).toBeLessThan(0.04);
    for (const c of cornerAt0) expect(Math.abs(c / n - 1 / 8)).toBeLessThan(0.03);
    for (const c of colourAt0) expect(Math.abs(c / n - 1 / 6)).toBeLessThan(0.03);
  });
});

describe('4x4x4 random-state scrambler', () => {
  it('reproduces 100 random states (the other 100 run in scramble444-more)', () => {
    const t0 = Date.now();
    init444();
    const init = Date.now() - t0;
    const t1 = Date.now();
    for (let i = 0; i < 100; i++) {
      const state = M.random444();
      const scr = scrambleFor444(state, FAST);
      expect(wellFormed(scr)).toBe(true);
      expect(reproduces(scr, M.render444(state))).toBe(true);
    }
    log(`[4x4] tables ${init}ms; 100 scrambles verified in ${Date.now() - t1}ms`);
  }, 120000);

  it('default setting: lengths and timings', () => {
    const lens: number[] = [];
    const times: number[] = [];
    const phases: string[] = [];
    for (let i = 0; i < 12; i++) {
      const state = M.random444();
      const t = Date.now();
      const r = solve444(state);
      const scr = outToString(toWcaMoves(r.solution.slice().reverse().map(M.invMove)));
      times.push(Date.now() - t);
      lens.push(scr.split(' ').length);
      phases.push(`${r.phases.join('/')}`);
      expect(wellFormed(scr)).toBe(true);
      expect(reproduces(scr, M.render444(state))).toBe(true);
    }
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sorted = times.slice().sort((a, b) => a - b);
    log(
      `[4x4] length mean ${mean.toFixed(1)} max ${Math.max(...lens)}; time median ${sorted[sorted.length >> 1]}ms max ${sorted[sorted.length - 1]}ms; phases ${phases.join(' ')} (last n3=${stats.nodes3})`,
    );
    expect(mean).toBeLessThan(52);
    expect(Math.max(...lens)).toBeLessThanOrEqual(56);
  }, 120000);

  it('is what generate() uses for 4x4, 4BLD and the virtual 4x4', () => {
    for (const ev of ['444', 'v444']) {
      const s = generate(ev);
      expect(wellFormed(s)).toBe(true);
      expect(s.split(' ').length).toBeGreaterThan(30);
    }
    const bld = generate('444bf').split(' ');
    const k = bld.findIndex((m) => /^[xyz]/.test(m));
    const core = k < 0 ? bld : bld.slice(0, k);
    expect(wellFormed(core.join(' '))).toBe(true);
    if (k >= 0) expect(bld.slice(k).every((m) => /^[xyz](2|')?$/.test(m))).toBe(true);
  }, 60000);
});
