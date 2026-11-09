<script lang="ts">
  import { formatTime } from '../../lib/stats/format';

  interface Series {
    label: string;
    values: ArrayLike<number>; // NaN = gap
    tone: 'strong' | 'mid' | 'soft';
  }

  let {
    singles,
    series,
    precision = 2,
    height = 280,
    labelFor = (i: number) => `#${i + 1}`,
    dots = true,
    singleLabel = 'single',
  }: { singles: ArrayLike<number>; series: Series[]; precision?: 2 | 3; height?: number; labelFor?: (i: number) => string; dots?: boolean; singleLabel?: string } = $props();

  let w = $state(800);
  let hover = $state<number | null>(null);
  let box: HTMLDivElement | undefined = $state();

  const M = { l: 52, r: 64, t: 12, b: 28 };
  const n = $derived(singles.length);

  // Robust y domain over everything drawn: clip the slowest 2% of singles so
  // outliers don't flatten the chart, but always include the average lines.
  const dom = $derived.by(() => {
    const finite: number[] = [];
    for (let i = 0; i < singles.length; i++) if (isFinite(singles[i])) finite.push(singles[i]);
    finite.sort((a, b) => a - b);
    let lo = finite.length ? finite[0] : Infinity;
    let hi = finite.length ? finite[Math.min(finite.length - 1, Math.floor(finite.length * 0.98))] : -Infinity;
    for (const s of series) {
      for (let i = 0; i < s.values.length; i++) {
        const v = s.values[i];
        if (!isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!isFinite(lo) || !isFinite(hi)) return { lo: 0, hi: 1 };
    const pad = Math.max(200, (hi - lo) * 0.08);
    return { lo: Math.max(0, lo - pad), hi: hi + pad };
  });
  const x = (i: number) => M.l + (n <= 1 ? 0.5 : i / (n - 1)) * (w - M.l - M.r);
  const y = (v: number) => M.t + (1 - (Math.min(v, dom.hi) - dom.lo) / (dom.hi - dom.lo)) * (height - M.t - M.b);

  const ticks = $derived.by(() => {
    const span = dom.hi - dom.lo;
    const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
    const step = steps.find((s) => span / s <= 6) ?? 600000;
    const out: number[] = [];
    for (let v = Math.ceil(dom.lo / step) * step; v <= dom.hi; v += step) out.push(v);
    return { step, values: out };
  });

  // Scatter: one dot per pixel at most, so 100k solves draw as fast as 1k.
  const dotsPath = $derived.by(() => {
    let d = '';
    const seen = new Set<number>();
    // Dots are ~3px wide: on big sessions a 2px grid looks identical and halves the markup again.
    const g = n > 5000 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const v = singles[i];
      if (!isFinite(v) || v > dom.hi) continue; // DNFs and far outliers stay in the tooltip only
      const px = Math.round(x(i) / g) * g;
      const py = Math.round(y(v) / g) * g;
      const k = px * 8192 + py;
      if (seen.has(k)) continue;
      seen.add(k);
      d += `M${px},${py}h0`;
    }
    return d;
  });
  // Lines: when there are more points than pixels, keep each column's min and max (the visible envelope).
  const linePaths = $derived(
    series.map((s) => {
      const len = s.values.length;
      const dense = len > (w - M.l - M.r) * 2;
      let d = '';
      let pen = false;
      let col = -1;
      let lo = 0;
      let hi = 0;
      const flush = () => {
        if (col < 0) return;
        d += `${pen ? 'L' : 'M'}${col},${lo.toFixed(1)}`;
        pen = true;
        if (hi !== lo) d += `L${col},${hi.toFixed(1)}`;
        col = -1;
      };
      let lastIdx = -1;
      for (let i = 0; i < len; i++) {
        const v = s.values[i];
        if (Number.isNaN(v) || !isFinite(v)) {
          flush();
          pen = false;
          continue;
        }
        lastIdx = i;
        const yy = y(v);
        if (!dense) {
          d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${yy.toFixed(1)}`;
          pen = true;
          continue;
        }
        const c = Math.round(x(i));
        if (c !== col) {
          flush();
          col = c;
          lo = hi = yy;
        } else {
          if (yy < lo) lo = yy;
          if (yy > hi) hi = yy;
        }
      }
      flush();
      return { ...s, d, lastIdx, ly: lastIdx >= 0 ? y(s.values[lastIdx]) + 4 : 0 };
    }),
  );
  /** Axis labels with consistent decimals for the step (12, 12.5, 12.25 — never "12" next to "12.50"). */
  function tickLabel(v: number, step: number): string {
    const t = formatTime(v, 2);
    if (step % 1000 === 0) return t.replace(/\.\d+$/, '');
    if (step % 100 === 0) return t.replace(/(\.\d)\d$/, '$1');
    return t;
  }
  // keep end labels at least 13px apart
  const labels = $derived.by(() => {
    const ls = linePaths.filter((l) => l.lastIdx >= 0).map((l) => ({ label: l.label, tone: l.tone, x: x(l.lastIdx) + 8, y: l.ly }));
    ls.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 13) ls[i].y = ls[i - 1].y + 13;
    return ls;
  });

  function onmove(e: PointerEvent) {
    if (!box || n === 0) return;
    const r = box.getBoundingClientRect();
    const px = e.clientX - r.left;
    const t = (px - M.l) / (w - M.l - M.r);
    hover = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  }
  const TONE = { strong: 'var(--accent)', mid: 'var(--fg-2)', soft: 'var(--fg-3)' };
  const WIDTH = { strong: 2, mid: 2, soft: 1.5 };
</script>

<div class="chart" bind:this={box} bind:clientWidth={w} onpointermove={onmove} onpointerleave={() => (hover = null)} role="img" aria-label="Times over the session">
  <svg width={w} {height}>
    {#each ticks.values as t}
      <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} class="grid" />
      <text x={M.l - 8} y={y(t) + 4} class="tick" text-anchor="end">{tickLabel(t, ticks.step)}</text>
    {/each}
    {#if dots}<path d={dotsPath} class="dots" />{/if}
    {#each linePaths as s (s.label)}
      <path d={s.d} fill="none" stroke={TONE[s.tone]} stroke-width={WIDTH[s.tone]} stroke-linejoin="round" stroke-linecap="round" />
    {/each}
    {#each labels as l (l.label)}
      <text x={l.x} y={l.y} class="end">{l.label}</text>
    {/each}
    <text x={M.l} y={height - 8} class="tick">{labelFor(0)}</text>
    <text x={w - M.r} y={height - 8} class="tick" text-anchor="end">{labelFor(Math.max(0, n - 1))}</text>
    {#if hover !== null}
      <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={height - M.b} class="cross" />
      {#if isFinite(singles[hover])}<circle cx={x(hover)} cy={y(singles[hover])} r="4" class="hdot" />{/if}
    {/if}
  </svg>
  {#if hover !== null}
    <div class="tip num" style="left:{Math.min(w - 170, Math.max(0, x(hover) + 12))}px">
      <div class="h">{labelFor(hover)}</div>
      {#if dots}<div><span>{singleLabel}</span>{formatTime(singles[hover], precision)}</div>{/if}
      {#each series as s}
        <div><span>{s.label}</span>{formatTime(s.values[hover], precision)}</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .chart {
    position: relative;
    width: 100%;
    user-select: none;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--line-2);
    stroke-width: 1;
    stroke-dasharray: 1 5;
    stroke-linecap: round;
  }
  .tick {
    font-size: 11px;
    fill: var(--fg-3);
    font-variant-numeric: tabular-nums;
  }
  .end {
    font-size: 11px;
    font-weight: 600;
    fill: var(--fg-2);
  }
  .dots {
    stroke: var(--fg-4);
    stroke-width: 3.2;
    stroke-linecap: round;
    fill: none;
  }
  .cross {
    stroke: var(--fg-3);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .hdot {
    fill: var(--fg);
    stroke: var(--bg);
    stroke-width: 2;
  }
  .tip {
    position: absolute;
    top: 8px;
    min-width: 150px;
    padding: 8px 10px;
    background: var(--glass);
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    backdrop-filter: blur(14px) saturate(1.4);
    border: 1px solid var(--line-2);
    border-radius: 12px;
    box-shadow: var(--hi), var(--shadow-float);
    font-size: 12px;
    pointer-events: none;
  }
  .tip .h {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-3);
    margin-bottom: 5px;
  }
  .tip div:not(.h) {
    display: flex;
    justify-content: space-between;
    gap: 14px;
  }
  .tip span {
    color: var(--fg-3);
  }
</style>
