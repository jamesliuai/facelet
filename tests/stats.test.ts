import { describe, expect, it } from 'vitest';
import { averageOf, computeStats, rolling, solveValue, trimCount, DNF, parseAvgSpec, neededForBest } from '../src/lib/stats/stats';
import { formatTime, formatSolve, parseTimeEntry } from '../src/lib/stats/format';

describe('WCA averages', () => {
  it('trim counts follow csTimer 5% ceil', () => {
    expect([3, 5, 12, 25, 50, 100, 1000].map((n) => trimCount(n))).toEqual([1, 1, 1, 2, 3, 5, 50]);
  });
  it('ao5 drops best and worst', () => {
    // 10.00 11.00 12.00 13.00 14.00 → 12.00
    expect(averageOf([10000, 11000, 12000, 13000, 14000], 1, 2)).toBe(12000);
    // one DNF counts as worst
    expect(averageOf([10000, 11000, 12000, 13000, DNF], 1, 2)).toBe(12000);
    expect(averageOf([10000, DNF, 12000, 13000, DNF], 1, 2)).toBe(DNF);
  });
  it('rounds averages to the nearest centisecond', () => {
    // (11.11 + 12.22 + 13.34)/3 = 12.2233.. → 12.22
    expect(averageOf([10000, 11110, 12220, 13340, 20000], 1, 2)).toBe(12220);
    // (1.01 + 1.02 + 1.02)/3 = 1.01666 → 1.02
    expect(averageOf([1000, 1010, 1020, 1020, 2000], 1, 2)).toBe(1020);
  });
  it('mean of 3 has no trimming and DNF poisons', () => {
    const mo3 = parseAvgSpec('mo3')!;
    const r = rolling([10000, 11000, 12000, DNF, 9000, 9000, 9000], mo3, 5, 2);
    expect(r[2]).toBe(11000);
    expect(r[3]).toBe(DNF);
    expect(r[6]).toBe(9000);
  });
  it('truncates singles', () => {
    expect(solveValue({ time: 12349, penalty: 0 })).toBe(12340);
    expect(solveValue({ time: 12349, penalty: 2000 })).toBe(14340);
    expect(solveValue({ time: 12349, penalty: 0 }, 3)).toBe(12349);
    expect(solveValue({ time: 12349, penalty: -1 })).toBe(DNF);
  });
  it('rolling matches direct computation at every index', () => {
    for (const dnfRate of [0, 0.05, 0.3]) {
      const vals = Array.from({ length: 400 }, () => (Math.random() < dnfRate ? DNF : 8000 + Math.floor(Math.random() * 800) * 10));
      for (const label of ['mo3', 'ao5', 'ao12', 'ao50', 'ao100', 'mo10']) {
        const spec = parseAvgSpec(label)!;
        for (const pct of [5, 20]) {
          for (const precision of [2, 3] as const) {
            const r = rolling(vals, spec, pct, precision);
            const trim = spec.mean ? 0 : trimCount(spec.n, pct);
            for (let i = 0; i < vals.length; i++) {
              const want = i < spec.n - 1 ? NaN : averageOf(vals.slice(i - spec.n + 1, i + 1), trim, precision);
              if (Number.isNaN(want)) expect(Number.isNaN(r[i])).toBe(true);
              else expect(r[i]).toBe(want);
            }
          }
        }
      }
    }
  });
  it('finds the slowest single that still sets a new best average', () => {
    const ao5 = parseAvgSpec('ao5')!;
    // last four: 10, 11, 12, 13; best ao5 so far 11.50
    const vals = [20000, 10000, 11000, 12000, 13000];
    const need = neededForBest(vals, ao5, 5, 2, 11500)!;
    // with x ≤ 10: avg of 10,11,12 → 11.00 < 11.50; with x = 11.49: avg(11, 11.49, 12) = 11.4966 → 11.50, not better
    expect(averageOf([10000, 11000, 12000, 13000, need], 1, 2)).toBeLessThan(11500);
    expect(averageOf([10000, 11000, 12000, 13000, need + 10], 1, 2)).toBeGreaterThanOrEqual(11500);
    // impossible: even a 0.00 can't beat a 5.00 best
    expect(neededForBest(vals, ao5, 5, 2, 5000)).toBeNull();
    // a DNF would still beat a 20.00 best
    expect(neededForBest(vals, ao5, 5, 2, 20000)).toBe(Infinity);
    // not enough solves for a best yet
    expect(neededForBest([10000, 11000], ao5, 5, 2, 11000)).toBeNull();
  });
  it('session stats', () => {
    const s = computeStats([12000, 10000, DNF, 11000, 13000, 9000], ['ao5', 'ao12'].map((x) => parseAvgSpec(x)!), 5, 2);
    expect(s.best).toBe(9000);
    expect(s.bestIndex).toBe(5);
    expect(s.dnf).toBe(1);
    expect(s.mean).toBe(11000);
    expect(s.avgs[0].current).toBe(11330); // 10,11,13 (drop 9 & DNF) → 11.333 → 11.33
    expect(s.avgs[0].best).toBe(11330);
    expect(Number.isNaN(s.avgs[1].current)).toBe(true);
  });
});

describe('formatting', () => {
  it('formats times', () => {
    expect(formatTime(12340)).toBe('12.34');
    expect(formatTime(62345)).toBe('1:02.34');
    expect(formatTime(3723450)).toBe('1:02:03.45');
    expect(formatTime(5999)).toBe('5.99');
    expect(formatTime(5999, 3)).toBe('5.999');
    expect(formatTime(DNF)).toBe('DNF');
    expect(formatSolve({ time: 10000, penalty: 2000 })).toBe('12.00+');
    expect(formatSolve({ time: 10000, penalty: -1 }, 2, true)).toBe('DNF(10.00)');
  });
  it('parses typed entries', () => {
    expect(parseTimeEntry('1234')).toEqual({ time: 12340, penalty: 0 });
    expect(parseTimeEntry('12345')).toEqual({ time: 83450, penalty: 0 });
    expect(parseTimeEntry('12.34')).toEqual({ time: 12340, penalty: 0 });
    expect(parseTimeEntry('1:23.45')).toEqual({ time: 83450, penalty: 0 });
    expect(parseTimeEntry('1234+')).toEqual({ time: 12340, penalty: 2000 });
    expect(parseTimeEntry('dnf')?.penalty).toBe(-1);
    expect(parseTimeEntry('DNF(12.34)')).toEqual({ time: 12340, penalty: -1 });
    expect(parseTimeEntry('abc')).toBeNull();
    expect(parseTimeEntry('99')).toEqual({ time: 990, penalty: 0 });
  });
});
