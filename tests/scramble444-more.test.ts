import { describe, expect, it } from 'vitest';
import * as M from '../src/lib/puzzles/cube444';
import { scrambleFor444 } from '../src/lib/puzzles/solver444';
import { FAST, reproduces, wellFormed } from './helpers444';

// A second batch of 100 states, in its own file so it runs in parallel.
describe('4x4x4 random-state scrambler, second batch', () => {
  it('reproduces 100 more random states', () => {
    for (let i = 0; i < 100; i++) {
      const state = M.random444();
      const scr = scrambleFor444(state, FAST);
      expect(wellFormed(scr)).toBe(true);
      expect(reproduces(scr, M.render444(state))).toBe(true);
    }
  }, 120000);
});
