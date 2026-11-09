<script lang="ts">
  let { dates }: { dates: number[] } = $props();
  let hover = $state<{ x: number; y: number; label: string } | null>(null);
  let scroller: HTMLDivElement | undefined = $state();
  let scrollLeft = $state(0);
  // Weeks run Monday to Sunday, like the weekday chart.
  const dow = (d: Date) => (d.getDay() + 6) % 7;

  const CELL = 12;
  const GAP = 3;
  const data = $derived.by(() => {
    const counts = new Map<string, number>();
    const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    for (const t of dates) {
      const k = key(new Date(t));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 7 * 52 - dow(today));
    const cells: { x: number; y: number; n: number; d: Date }[] = [];
    const months: { x: number; label: string }[] = [];
    let lastMonth = -1;
    for (let i = 0; ; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (d > today) break;
      const week = Math.floor(i / 7);
      const x = week * (CELL + GAP);
      if (d.getMonth() !== lastMonth && dow(d) === 0) {
        months.push({ x, label: d.toLocaleDateString(undefined, { month: 'short' }) });
        lastMonth = d.getMonth();
      }
      cells.push({ x, y: dow(d) * (CELL + GAP), n: counts.get(key(d)) ?? 0, d });
    }
    let max = 1;
    for (const c of cells) if (c.n > max) max = c.n;
    const days = cells.filter((c) => c.n > 0).length;
    // streaks
    let best = 0;
    let cur = 0;
    for (const c of cells) {
      cur = c.n > 0 ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    let current = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].n > 0) current++;
      else if (i === cells.length - 1) continue;
      else break;
    }
    const width = (Math.floor((cells.length - 1) / 7) + 1) * (CELL + GAP);
    return { cells, months, max, days, best, current, width };
  });
  const level = (n: number, max: number) => (n === 0 ? 0 : Math.min(4, 1 + Math.floor((n / max) * 3.999)));

  // Open on the most recent weeks when the calendar is wider than its card.
  $effect(() => {
    void data.width;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });
</script>

<div class="heat" style="position:relative">
  <div class="scroll" bind:this={scroller} onscroll={() => (scrollLeft = scroller?.scrollLeft ?? 0)}>
    <svg width={data.width + 30} height={7 * (CELL + GAP) + 22} role="img" aria-label="Practice calendar">
      {#each data.months as m}<text x={m.x + 30} y={10} class="m">{m.label}</text>{/each}
      {#each ['Mon', 'Wed', 'Fri'] as d, i}<text x={0} y={18 + i * 2 * (CELL + GAP) + CELL - 2} class="m">{d}</text>{/each}
      {#each data.cells as c}
        <rect
          x={c.x + 30}
          y={c.y + 18}
          width={CELL}
          height={CELL}
          rx="3"
          class="c l{level(c.n, data.max)}"
          role="presentation"
          onpointerenter={() => (hover = { x: c.x + 30, y: c.y, label: `${c.n} solve${c.n === 1 ? '' : 's'} · ${c.d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}` })}
          onpointerleave={() => (hover = null)}
        />
      {/each}
    </svg>
  </div>
  {#if hover}<div class="tip" style="left:{Math.max(0, hover.x - 60 - scrollLeft)}px; top:{hover.y - 14}px">{hover.label}</div>{/if}
  <div class="legend">
    <span class="num">{data.days} active {data.days === 1 ? 'day' : 'days'} in the past year · current streak {data.current} · best streak {data.best}</span>
    <span class="scale">Less {#each [0, 1, 2, 3, 4] as l}<i class="c l{l}"></i>{/each} More</span>
  </div>
</div>

<style>
  .scroll {
    overflow-x: auto;
    position: relative;
    padding-bottom: 4px;
  }
  svg {
    display: block;
  }
  .m {
    font-size: 10px;
    fill: var(--fg-3);
  }
  .c {
    fill: var(--bg-3);
  }
  .c.l1 {
    fill: color-mix(in srgb, var(--accent) 22%, var(--bg));
  }
  .c.l2 {
    fill: color-mix(in srgb, var(--accent) 45%, var(--bg));
  }
  .c.l3 {
    fill: color-mix(in srgb, var(--accent) 70%, var(--bg));
  }
  .c.l4 {
    fill: var(--accent);
  }
  .legend {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: var(--fg-3);
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .scale {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .scale i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--bg-3);
  }
  .scale i.l1 {
    background: color-mix(in srgb, var(--accent) 22%, var(--bg));
  }
  .scale i.l2 {
    background: color-mix(in srgb, var(--accent) 45%, var(--bg));
  }
  .scale i.l3 {
    background: color-mix(in srgb, var(--accent) 70%, var(--bg));
  }
  .scale i.l4 {
    background: var(--accent);
  }
  .tip {
    position: absolute;
    padding: 5px 9px;
    background: var(--inv-bg);
    color: var(--inv-fg);
    border-radius: 7px;
    font-size: 11.5px;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
