<script lang="ts">
  import { formatTime } from '../../lib/stats/format';

  let { values, precision = 2, height = 220 }: { values: number[]; precision?: 2 | 3; height?: number } = $props();
  let w = $state(600);
  let hover = $state<number | null>(null);
  const M = { l: 36, r: 8, t: 10, b: 26 };

  const bins = $derived.by(() => {
    const f = values.filter((v) => isFinite(v)).sort((a, b) => a - b);
    if (f.length < 2) return [];
    const lo = f[Math.floor(f.length * 0.01)];
    const hi = f[Math.min(f.length - 1, Math.floor(f.length * 0.99))];
    const span = Math.max(1, hi - lo);
    const sizes = [100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    const size = sizes.find((s) => span / s <= 24) ?? 60000;
    const start = Math.floor(lo / size) * size;
    const count = Math.max(1, Math.ceil((hi - start + 1) / size));
    const out = Array.from({ length: count }, (_, i) => ({ from: start + i * size, to: start + (i + 1) * size, n: 0 }));
    for (const v of f) {
      const i = Math.min(count - 1, Math.max(0, Math.floor((v - start) / size)));
      out[i].n++;
    }
    return out;
  });
  // Integer y ticks at a "nice" step, with the chart scaled to the top tick
  // (rounding fractions of the max produced repeats like 1, 2, 2, 3).
  const yAxis = $derived.by(() => {
    let peak = 1;
    for (const b of bins) if (b.n > peak) peak = b.n;
    const raw = peak / 4;
    const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
    const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
    const top = Math.ceil(peak / step) * step;
    const ticks: number[] = [];
    for (let v = step; v <= top; v += step) ticks.push(v);
    return { top, ticks };
  });
  const max = $derived(yAxis.top);
  const binSize = $derived(bins.length ? bins[0].to - bins[0].from : 1000);
  function xLabel(v: number): string {
    const t = formatTime(v, 2);
    if (binSize % 1000 === 0) return t.replace(/\.\d+$/, '');
    if (binSize % 100 === 0) return t.replace(/(\.\d)\d$/, '$1');
    return t;
  }
  const bw = $derived(bins.length ? (w - M.l - M.r) / bins.length : 0);
  const total = $derived(bins.reduce((a, b) => a + b.n, 0));
</script>

<div class="hist" bind:clientWidth={w} role="img" aria-label="Distribution of times">
  <svg width={w} {height}>
    {#each yAxis.ticks as t}
      {@const ty = M.t + (1 - t / max) * (height - M.t - M.b)}
      <line x1={M.l} x2={w - M.r} y1={ty} y2={ty} class="grid" />
      <text x={M.l - 6} y={ty + 4} class="tick" text-anchor="end">{t.toLocaleString()}</text>
    {/each}
    {#each bins as b, i}
      {@const h = (b.n / max) * (height - M.t - M.b)}
      <rect
        x={M.l + i * bw + 1}
        y={height - M.b - h}
        width={Math.max(1, bw - 2)}
        height={h}
        rx={Math.min(4, bw / 3)}
        class="bar"
        class:hl={hover === i}
        role="presentation"
        onpointerenter={() => (hover = i)}
        onpointerleave={() => (hover = null)}
      />
      <rect x={M.l + i * bw} y={M.t} width={bw} height={height - M.t - M.b} fill="transparent" role="presentation" onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)} />
      {#if i % Math.max(1, Math.ceil(bins.length / 8)) === 0}
        <text x={M.l + i * bw} y={height - 8} class="tick">{xLabel(b.from)}</text>
      {/if}
    {/each}
  </svg>
  {#if hover !== null && bins[hover]}
    <div class="tip num" style="left:{Math.min(w - 160, M.l + hover * bw)}px">
      {formatTime(bins[hover].from, precision)}–{formatTime(bins[hover].to, precision)}<br />
      <b>{bins[hover].n}</b> solves · {((bins[hover].n / total) * 100).toFixed(1)}%
    </div>
  {/if}
</div>

<style>
  .hist {
    position: relative;
  }
  svg {
    display: block;
  }
  .grid {
    stroke: var(--line);
  }
  .tick {
    font-size: 11px;
    fill: var(--fg-3);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    fill: var(--fg-2);
    transition: fill 0.1s;
  }
  .bar.hl {
    fill: var(--accent);
  }
  .tip {
    position: absolute;
    top: 0;
    padding: 7px 10px;
    background: var(--glass);
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    backdrop-filter: blur(14px) saturate(1.4);
    border: 1px solid var(--line-2);
    border-radius: 10px;
    box-shadow: var(--hi), var(--shadow-float);
    font-size: 12px;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
