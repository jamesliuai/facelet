import { describe, expect, it } from 'vitest';
import { TimerEngine, type Result } from '../src/lib/timer/engine';

function make(inspection = false, phases = 1) {
  const e = new TimerEngine({ holdTime: 300, inspection, inspectionMs: 15000, phases });
  const results: Result[] = [];
  e.onResult = (r) => results.push(r);
  return { e, results };
}

describe('timer engine', () => {
  it('hold, release, stop', () => {
    const { e, results } = make();
    e.press(0);
    e.tick(100);
    expect(e.phase).toBe('holding');
    e.tick(310);
    expect(e.phase).toBe('ready');
    e.release(400);
    expect(e.phase).toBe('running');
    e.press(12740);
    expect(e.phase).toBe('stopped');
    e.release(12800);
    expect(e.phase).toBe('idle');
    expect(results[0]).toEqual({ time: 12340, penalty: 0, splits: [], inspection: null });
  });

  it('early release does not start', () => {
    const { e } = make();
    e.press(0);
    e.tick(100);
    e.release(150);
    expect(e.phase).toBe('idle');
  });

  it('inspection penalties', () => {
    const run = (used: number) => {
      const { e, results } = make(true);
      e.press(0);
      e.release(10);
      expect(e.phase).toBe('inspecting');
      e.press(used - 400);
      e.tick(used - 50);
      e.release(10 + used);
      e.press(10 + used + 9000);
      return results[0];
    };
    expect(run(9000).penalty).toBe(0);
    expect(run(15500).penalty).toBe(2000);
    expect(run(17000).penalty).toBe(-1);
    expect(run(9000).inspection).toBe(9000);
  });

  it('multi-phase splits', () => {
    const { e, results } = make(false, 3);
    e.press(0);
    e.tick(400);
    e.release(400);
    e.press(2400);
    e.press(6400);
    expect(e.phase).toBe('running');
    e.press(9400);
    expect(results[0].splits).toEqual([2000, 6000]);
    expect(results[0].time).toBe(9000);
  });

  it('an abandoned hold returns to idle or inspection', () => {
    const { e } = make();
    e.press(0);
    e.tick(400);
    expect(e.phase).toBe('ready');
    e.abortHold();
    expect(e.phase).toBe('idle');
    const i = make(true).e;
    i.press(0);
    i.release(10);
    i.press(2000);
    i.tick(2400);
    expect(i.phase).toBe('ready');
    i.abortHold();
    expect(i.phase).toBe('inspecting');
    expect(i.inspecting).toBe(true);
  });
});
