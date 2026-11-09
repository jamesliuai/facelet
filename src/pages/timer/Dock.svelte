<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import Select from '../../components/Select.svelte';
  import { settings, type DockPanel, type SolverKind } from '../../lib/store/settings.svelte';
  import { sessions } from '../../lib/store/sessions.svelte';
  import { timer } from '../../lib/timer/timer.svelte';
  import { scrambleSvg } from '../../lib/render/scramble-svg';
  import { call } from '../../lib/scramble/client';
  import { formatTime } from '../../lib/stats/format';
  import type { ToolResult } from '../../lib/tools/blocks';

  const ev = $derived(sessions.event);
  const is333 = $derived(ev.puzzle === 'nxn' && ev.size === 3 && ev.id !== '333mbf');
  const hasPreview = $derived(ev.id !== '333mbf');
  const tabs = $derived<{ id: DockPanel; label: string }[]>([
    ...(hasPreview ? [{ id: 'image' as const, label: 'Preview' }] : []),
    ...(is333 ? [{ id: 'solver' as const, label: 'Solver' }] : []),
    { id: 'graph', label: 'Trend' },
  ]);
  const tab = $derived(tabs.some((t) => t.id === settings.toolPanel) ? settings.toolPanel : tabs[0].id);

  const SOLVERS: { value: SolverKind; label: string }[] = [
    { value: 'cross', label: 'Cross' },
    { value: 'xcross', label: 'XCross' },
    { value: 'eoline', label: 'EOLine' },
    { value: 'roux', label: 'Roux block' },
    { value: '222', label: '2x2x2 block' },
  ];
  const allowsAll = $derived(settings.solverKind === 'cross' || settings.solverKind === 'eoline' || settings.solverKind === '222');

  let big = $state(false);
  const svg = $derived(timer.scramble && hasPreview ? scrambleSvg(ev.id, timer.scramble, settings.cubeColors) : '');

  // block solver results
  let result: ToolResult | null = $state(null);
  let busy = $state(false);
  let reqKey = '';
  $effect(() => {
    const kind = settings.solverKind;
    const scr = timer.scramble;
    const col = settings.crossColour;
    if (settings.dockCollapsed || tab !== 'solver' || !scr || !is333) return;
    const key = `${kind}|${col}|${scr}`;
    if (key === reqKey) return;
    reqKey = key;
    busy = true;
    const all = kind === 'cross' || kind === 'eoline' || kind === '222';
    const options = all ? { colour: col, limit: 1 } : { colour: col < 0 ? 0 : col, limit: 1 };
    call<ToolResult>('tool', { tool: kind, scramble: scr, options })
      .then((r) => {
        if (reqKey === key) result = r;
      })
      .catch(() => {
        if (reqKey === key) result = null;
      })
      .finally(() => {
        if (reqKey === key) busy = false;
      });
  });

  const COLOURS = ['White', 'Red', 'Green', 'Yellow', 'Orange', 'Blue'];

  // trend chart
  const trend = $derived.by(() => {
    void sessions.version;
    if (tab !== 'graph' || settings.dockCollapsed) return null;
    const vals = sessions.engine.values.slice(-100);
    const ao = sessions.engine.seriesFor('ao5')?.values.slice(-100) ?? [];
    const finite = vals.filter((v) => isFinite(v));
    if (finite.length < 2) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const v of finite) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const W = 268;
    const H = 96;
    const pad = 4;
    const x = (i: number) => pad + (i / Math.max(1, vals.length - 1)) * (W - 2 * pad);
    const y = (v: number) => pad + (1 - (v - min) / Math.max(1, max - min)) * (H - 2 * pad);
    const dots = vals.map((v, i) => (isFinite(v) ? { x: x(i), y: y(v) } : null)).filter((d) => !!d) as { x: number; y: number }[];
    let line = '';
    ao.forEach((v, i) => {
      if (!Number.isNaN(v) && isFinite(v)) line += `${line ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return { W, H, dots, line, min, max, n: vals.length };
  });
</script>

<div class="dock" class:collapsed={settings.dockCollapsed} data-no-timer>
  <div class="head">
    {#if !settings.dockCollapsed}
      <div class="tabs" role="tablist">
        {#each tabs as t (t.id)}
          <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => (settings.toolPanel = t.id)}>{t.label}</button>
        {/each}
      </div>
    {:else}
      <button class="label" onclick={() => (settings.dockCollapsed = false)}>{tabs.find((t) => t.id === tab)?.label ?? 'Tools'}</button>
    {/if}
    <button class="icon-btn sm" onclick={() => (settings.dockCollapsed = !settings.dockCollapsed)} aria-label={settings.dockCollapsed ? 'Expand tools' : 'Collapse tools'}>
      <Icon name={settings.dockCollapsed ? 'up' : 'down'} size={15} />
    </button>
  </div>
  {#if !settings.dockCollapsed}
    <div class="body">
      {#if tab === 'image'}
        {#if !settings.showScrambleImage}
          <button class="btn sm" onclick={() => (settings.showScrambleImage = true)}>Show preview</button>
        {:else if svg}
          <button class="preview" onclick={() => (big = true)} aria-label="Enlarge scramble preview">{@html svg}</button>
        {:else}
          <div class="skeleton" aria-label="Loading preview"></div>
        {/if}
      {:else if tab === 'graph'}
        {#if trend}
          <svg viewBox="0 0 {trend.W} {trend.H}" class="chart" aria-label="Recent solves trend">
            {#each trend.dots as d}<circle cx={d.x} cy={d.y} r="1.6" fill="var(--fg-4)" />{/each}
            <path d={trend.line} fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round" />
          </svg>
          <div class="axis num"><span>{formatTime(trend.min, settings.precision)}</span><span>last {trend.n} · ao5</span><span>{formatTime(trend.max, settings.precision)}</span></div>
        {:else}
          <p class="muted small">A couple of solves and your trend appears here.</p>
        {/if}
      {:else}
        <div class="solver-head">
          <Select options={SOLVERS} value={settings.solverKind} onchange={(v) => (settings.solverKind = v)} size="sm" plain label="Solver" />
          <div class="colour-pick">
            {#if allowsAll}
              <button class:on={settings.crossColour < 0} onclick={() => (settings.crossColour = -1)}>All</button>
            {/if}
            {#each COLOURS as c, i}
              <button
                class="sw"
                class:on={settings.crossColour === i || (settings.crossColour < 0 && i === 0 && !allowsAll)}
                onclick={() => (settings.crossColour = i)}
                aria-label={c}
                title={c}
              >
                <span style="background:{settings.cubeColors[i]}"></span>
              </button>
            {/each}
          </div>
        </div>
        {#if result && !busy}
          <div class="rows">
            {#each result.rows as r}
              <div class="r">
                <span class="name">{r.label}</span>
                <span class="len num">{r.length < 0 ? '—' : r.length}</span>
                <span class="sol mono">{#if r.rotation}<span class="rot">{r.rotation}</span>{/if}{r.solutions[0] ?? ''}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="muted small">Solving…</p>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<Modal bind:open={big} title="Scramble preview" width={720}>
  <div class="bigimg">{@html svg}</div>
  <p class="mono bigscr">{timer.scramble}</p>
</Modal>

<style>
  .dock {
    width: clamp(250px, 22vw, 300px);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-xl);
    box-shadow: var(--hi), var(--shadow-float);
    overflow: hidden;
  }
  .dock.collapsed {
    width: auto;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 6px 6px 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  .collapsed .head {
    border-bottom: 0;
    padding-left: 6px;
  }
  .label {
    height: 24px;
    padding: 0 8px;
    border-radius: 6px;
  }
  .label:hover {
    color: var(--fg);
  }
  .tabs {
    display: flex;
    gap: 2px;
  }
  .tabs button {
    height: 26px;
    padding: 0 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--fg-3);
    white-space: nowrap;
    transition: color 0.15s, background 0.15s;
  }
  .tabs button:hover {
    color: var(--fg);
  }
  .tabs button.active {
    color: var(--fg);
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .body {
    padding: 12px;
    min-height: 120px;
  }
  .preview {
    display: block;
    width: 100%;
    cursor: zoom-in;
  }
  .preview :global(svg) {
    width: 100%;
    height: auto;
    display: block;
    max-height: 200px;
  }
  .skeleton {
    height: 150px;
    border-radius: 12px;
    background: var(--bg-3);
    animation: breathe 1.2s var(--ease-in-out) infinite alternate;
  }
  @keyframes breathe {
    from {
      opacity: 0.5;
    }
    to {
      opacity: 1;
    }
  }
  .small {
    font-size: 12.5px;
    margin: 6px 0;
  }
  .chart {
    width: 100%;
    height: auto;
    display: block;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--fg-3);
    margin-top: 4px;
  }
  .solver-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin: -4px 0 8px -6px;
  }
  .colour-pick {
    display: flex;
    gap: 2px;
    align-items: center;
  }
  .colour-pick button {
    height: 22px;
    padding: 0 6px;
    border-radius: 6px;
    font-size: 11.5px;
    color: var(--fg-3);
    border: 1px solid transparent;
  }
  .colour-pick button.on {
    border-color: var(--line-3);
    color: var(--fg);
  }
  .colour-pick .sw {
    width: 20px;
    padding: 0;
    display: grid;
    place-items: center;
  }
  .sw span {
    width: 11px;
    height: 11px;
    border-radius: 3px;
    border: 1px solid var(--line-3);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 210px;
    overflow: auto;
  }
  .r {
    display: grid;
    grid-template-columns: 74px 18px 1fr;
    gap: 8px;
    align-items: baseline;
    font-size: 12px;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
  }
  .r:last-child {
    border-bottom: 0;
  }
  .name {
    color: var(--fg-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .len {
    font-weight: 600;
    text-align: right;
  }
  .sol {
    font-size: 11.5px;
    color: var(--fg);
    user-select: text;
  }
  .rot {
    color: var(--fg-3);
    margin-right: 6px;
  }
  .bigimg :global(svg) {
    width: 100%;
    height: auto;
    max-height: 60vh;
  }
  .bigscr {
    font-size: 14px;
    color: var(--fg-2);
    white-space: pre-line;
    margin: 14px 0 0;
    user-select: text;
  }
</style>
