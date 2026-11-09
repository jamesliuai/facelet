<script lang="ts">
  let { values, labels, height = 120, unit = 'solves' }: { values: number[]; labels: string[]; height?: number; unit?: string } = $props();
  let w = $state(400);
  let hover = $state<number | null>(null);
  const max = $derived(Math.max(1, ...values));
  const bw = $derived(w / Math.max(1, values.length));
</script>

<div class="bars" bind:clientWidth={w}>
  <svg width={w} height={height + 18} role="img" aria-label="Distribution">
    {#each values as v, i}
      {@const h = (v / max) * height}
      <rect x={i * bw + 1} y={height - h} width={Math.max(1, bw - 2)} height={Math.max(h, v ? 2 : 0)} rx={Math.min(4, bw / 3)} class="bar" class:hl={hover === i} />
      <rect x={i * bw} y="0" width={bw} height={height} fill="transparent" role="presentation" onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)} />
      {#if labels[i]}<text x={i * bw + bw / 2} y={height + 14} class="tick" text-anchor="middle">{labels[i]}</text>{/if}
    {/each}
  </svg>
  {#if hover !== null}
    <div class="tip num" style="left:{Math.min(w - 120, hover * bw)}px">{values[hover]} {unit}</div>
  {/if}
</div>

<style>
  .bars {
    position: relative;
  }
  svg {
    display: block;
  }
  .bar {
    fill: var(--fg-3);
  }
  .bar.hl {
    fill: var(--fg);
  }
  .tick {
    font-size: 10px;
    fill: var(--fg-3);
  }
  .tip {
    position: absolute;
    top: -6px;
    padding: 4px 8px;
    background: var(--inv-bg);
    color: var(--inv-fg);
    border-radius: 7px;
    font-size: 11.5px;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
