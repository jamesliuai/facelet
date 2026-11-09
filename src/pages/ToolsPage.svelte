<script lang="ts">
  import { onDestroy } from 'svelte';
  import Select from '../components/Select.svelte';
  import Slider from '../components/Slider.svelte';
  import Icon from '../components/Icon.svelte';
  import { EVENTS, eventById } from '../lib/scramble/events';
  import { scrambles, call } from '../lib/scramble/client';
  import { copyText } from '../lib/commands';
  import { download } from '../lib/io/export';
  import { scrambleSvg } from '../lib/render/scramble-svg';
  import { settings } from '../lib/store/settings.svelte';
  import { metronomeClick, audioTime } from '../lib/timer/audio';
  import { ui } from '../lib/store/ui.svelte';
  import { parseTimeEntry, formatTime } from '../lib/stats/format';
  import { averageOf, trimCount, sigmaOf, solveValue } from '../lib/stats/stats';
  import { isValidAlg } from '../lib/cube/alg';
  import type { ToolResult } from '../lib/tools/blocks';

  // ---------------------------------------------------------------- batch scrambles
  let ev = $state('333');
  let type = $state('wca');
  let count = $state(5);
  let images = $state(true);
  // The generated batch remembers its own event, so changing the picker doesn't redraw it as another puzzle.
  let batch = $state<{ ev: string; type: string; list: string[] }>({ ev: '333', type: 'wca', list: [] });
  let progress = $state<{ done: number; total: number } | null>(null);
  let cancelled = false;
  const evDef = $derived(eventById(ev));
  const batchDef = $derived(eventById(batch.ev));
  const typeOptions = $derived(evDef.scrambles.map((s) => ({ value: s.id, label: s.name })));
  $effect(() => {
    if (!evDef.scrambles.some((s) => s.id === type)) type = evDef.scrambles[0].id;
  });
  // Small chunks keep the shared scramble worker free for the timer, and allow progress and cancel.
  let gen = 0;
  async function generate() {
    const total = Math.max(1, Math.min(200, Math.floor(count) || 1));
    const id = ++gen;
    const evAt = ev;
    const typeAt = type;
    let list: string[] = [];
    batch = { ev: evAt, type: typeAt, list };
    cancelled = false;
    progress = { done: 0, total };
    try {
      while (list.length < total && !cancelled) {
        const chunk = await scrambles(evAt, typeAt, Math.min(5, total - list.length));
        if (id !== gen) return;
        list = [...list, ...chunk];
        batch = { ev: evAt, type: typeAt, list };
        progress = { done: list.length, total };
      }
    } catch {
      ui.toast('Could not generate scrambles');
    } finally {
      if (id === gen) progress = null;
    }
  }
  const asText = () => {
    const head = `${batchDef.name} · ${new Date().toLocaleDateString()}`;
    return head + '\n\n' + batch.list.map((s, i) => `${i + 1}. ${s.replace(/\n/g, '\n   ')}`).join('\n');
  };

  // ---------------------------------------------------------------- block solver
  let scr = $state('');
  let tool = $state('cross');
  let toolResult = $state<{ key: string; r: ToolResult } | null>(null);
  let solving = $state(false);
  const toolKey = $derived(`${tool}|${scr.trim()}`);
  async function solve() {
    if (!scr.trim() || !isValidAlg(scr)) return;
    solving = true;
    const key = toolKey;
    try {
      const r = await call<ToolResult>('tool', { tool, scramble: scr, options: { colour: tool === 'cross' || tool === 'eoline' || tool === '222' ? -1 : 0, limit: 3 } });
      toolResult = { key, r };
    } catch {
      ui.toast('Could not solve that scramble');
    } finally {
      solving = false;
    }
  }

  // ---------------------------------------------------------------- average calculator
  let timesText = $state('12.34 11.20 13.05 DNF 10.98');
  const calc = $derived.by(() => {
    const p = settings.precision;
    // A lone "+2" or "+" after a time belongs to that time ("12.34 +2").
    const tokens = timesText.split(/[\s,;]+/).filter(Boolean);
    const merged: string[] = [];
    for (const t of tokens) {
      if (/^\+2?$/.test(t) && merged.length) merged[merged.length - 1] += '+';
      else merged.push(t);
    }
    const entries = merged.map((t) => parseTimeEntry(t, p)).filter((x): x is NonNullable<typeof x> => !!x);
    const values = entries.map((e) => solveValue(e, p));
    const n = values.length;
    if (!n) return null;
    const trim = n >= 5 ? trimCount(n, settings.trimPct) : 0;
    let best = Infinity;
    let worst = -Infinity;
    for (const v of values) {
      if (v < best) best = v;
      if (v > worst) worst = v;
    }
    return {
      n,
      p,
      best,
      worst,
      mean: averageOf(values, 0, p),
      avg: n >= 3 ? averageOf(values, trim, p) : NaN,
      trim,
      sigma: sigmaOf(values, trim),
      // Fewer than five: a plain mean, so call it one.
      label: trim ? `ao${n}` : `mo${n}`,
    };
  });

  // ---------------------------------------------------------------- metronome
  // Clicks are scheduled on the audio clock a little ahead of time, so the beat
  // doesn't drift or jitter (and keeps time in a background tab).
  let bpm = $state(90);
  let accent = $state(4);
  let running = $state(false);
  let beat = $state(0);
  let handle = 0;
  let nextAt = 0;
  let count0 = 0;
  function schedule() {
    const t = audioTime();
    if (t == null) return;
    while (nextAt < t + 0.12) {
      metronomeClick(count0 % accent === 0, nextAt);
      count0++;
      nextAt += 60 / bpm;
    }
    beat = count0;
    handle = window.setTimeout(schedule, 25);
  }
  function toggleMetronome() {
    running = !running;
    clearTimeout(handle);
    beat = 0;
    count0 = 0;
    if (running) {
      const t = audioTime();
      if (t == null) {
        running = false;
        ui.toast('Audio is unavailable in this browser');
        return;
      }
      nextAt = t + 0.05;
      schedule();
    }
  }
  onDestroy(() => clearTimeout(handle));
</script>

<div class="page">
  <div class="page-inner">
    <span class="eyebrow">Scrambles · Solvers · Practice</span>
    <h1 class="page-title">Tools</h1>
    <p class="page-sub">Scramble sheets for any event, optimal block solutions for any scramble, a WCA average calculator and a metronome.</p>

    <section class="card block">
      <header>
        <div><h2>Scramble generator</h2><p class="muted">Random-state where the WCA requires it. Handy for meetups, races and printing.</p></div>
      </header>
      <div class="row">
        <Select options={EVENTS.map((e) => ({ value: e.id, label: e.name }))} bind:value={ev} width={240} />
        {#if typeOptions.length > 1}<Select options={typeOptions} bind:value={type} width={240} />{/if}
        <label class="cnt">Count <input class="input num" type="number" min="1" max="200" bind:value={count} /></label>
        {#if progress}
          <button class="btn" onclick={() => (cancelled = true)}>Stop · {progress.done}/{progress.total}</button>
        {:else}
          <button class="btn primary" onclick={generate}>Generate</button>
        {/if}
        {#if batch.list.length}
          <span class="grow"></span>
          <label class="img-toggle"><input type="checkbox" bind:checked={images} /> Previews</label>
          <button class="btn sm" onclick={() => copyText(asText(), 'Scrambles copied')}><Icon name="copy" size={14} />Copy</button>
          <button class="btn sm" onclick={() => download(`${batchDef.short}-scrambles.txt`, asText(), 'text/plain')}><Icon name="download" size={14} />.txt</button>
          <button class="btn sm" onclick={() => window.print()}>Print</button>
        {/if}
      </div>
      {#if batch.list.length}
        <div class="print-area">
          <h3 class="print-title">{batchDef.name}{batch.type !== 'wca' ? ` · ${batchDef.scrambles.find((x) => x.id === batch.type)?.name ?? ''}` : ''} <span class="muted">· {batch.list.length} scrambles · {new Date().toLocaleDateString()}</span></h3>
          <ol class="scrs">
            {#each batch.list as s, i}
              <li>
                <span class="i num">{i + 1}</span>
                <span class="s mono">{s}</span>
                {#if images}<span class="pv">{@html scrambleSvg(batch.ev, s, settings.cubeColors)}</span>{/if}
              </li>
            {/each}
          </ol>
        </div>
      {/if}
    </section>

    <div class="two">
      <section class="card block">
        <header><div><h2>Block solver</h2><p class="muted">Optimal cross, XCross, EOLine, Roux first block or 2x2x2 for any 3x3 scramble.</p></div></header>
        <textarea class="input mono" rows="3" bind:value={scr} placeholder="Paste a 3x3 scramble"></textarea>
        <div class="row">
          <Select options={[{ value: 'cross', label: 'Cross (all colours)' }, { value: 'xcross', label: 'XCross (white)' }, { value: 'eoline', label: 'EOLine (all colours)' }, { value: 'roux', label: 'Roux first block (white)' }, { value: '222', label: '2x2x2 block (all colours)' }]} bind:value={tool} width={240} />
          <button class="btn primary" onclick={solve} disabled={solving || !scr.trim()}>{solving ? 'Solving…' : 'Solve'}</button>
          {#if scr.trim() && !isValidAlg(scr)}<span class="muted">Not valid notation</span>{/if}
        </div>
        {#if toolResult && toolResult.key === toolKey}
          <div class="res">
            {#each toolResult.r.rows as r}
              <div class="rr">
                <span class="lbl">{r.label}</span>
                <span class="len num">{r.length}</span>
                <span class="sol mono">{#each r.solutions as s}<span><span class="rot">{r.rotation}</span> {s}</span>{/each}</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="card block">
        <header><div><h2>Average calculator</h2><p class="muted">Paste times (spaces or new lines; <span class="mono">12.34+</span> or <span class="mono">DNF</span> for penalties). Five or more use WCA trimming; fewer give a mean.</p></div></header>
        <textarea class="input mono" rows="3" bind:value={timesText} aria-label="Times"></textarea>
        {#if calc}
          <div class="calc num">
            <div><span>{calc.label}</span><b>{formatTime(calc.avg, calc.p)}</b></div>
            <div><span>mean</span><b>{formatTime(calc.mean, calc.p)}</b></div>
            <div><span>best</span><b>{formatTime(calc.best, calc.p)}</b></div>
            <div><span>σ</span><b>{Number.isNaN(calc.sigma) ? '–' : (calc.sigma / 1000).toFixed(2)}</b></div>
          </div>
          <p class="muted small">{calc.n} times{calc.trim ? ` · ${calc.trim} trimmed from each end` : ''}</p>
        {/if}
      </section>
    </div>

    <section class="card block">
      <header><div><h2>Metronome</h2><p class="muted">Drill turning at a steady pace (TPS practice, lookahead).</p></div></header>
      <div class="metro">
        <button class="beat" class:on={running} onclick={toggleMetronome} aria-label={running ? 'Stop metronome' : 'Start metronome'}>
          <Icon name={running ? 'pause' : 'play'} size={22} />
        </button>
        <div class="ctl">
          <span class="label">Tempo</span>
          <Slider bind:value={bpm} min={30} max={300} step={1} format={(v) => `${v} bpm · ${(v / 60).toFixed(1)} TPS`} label="Tempo" />
        </div>
        <div class="ctl">
          <span class="label">Accent every</span>
          <Slider bind:value={accent} min={1} max={8} step={1} format={(v) => (v === 1 ? 'every beat' : `${v} beats`)} label="Accent" />
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .block {
    padding: 22px 24px;
    margin-bottom: 14px;
    min-width: 0;
    border-radius: var(--r-xl);
  }
  .block header {
    margin-bottom: 14px;
  }
  h2 {
    font-family: var(--display);
    font-size: 27px;
    font-weight: 400;
    line-height: 1.1;
    letter-spacing: -0.01em;
    margin: 0;
  }
  :global(:root[data-heading='sans']) h2 {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.015em;
  }
  header p {
    margin: 5px 0 0;
    font-size: 13px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .grow {
    flex: 1;
  }
  .cnt {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--fg-2);
  }
  .cnt input {
    width: 70px;
    height: 32px;
  }
  .img-toggle {
    font-size: 13px;
    color: var(--fg-2);
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .scrs {
    list-style: none;
    padding: 0;
    margin: 16px 0 0;
    border-top: 1px solid var(--line);
  }
  .scrs li {
    display: grid;
    grid-template-columns: 32px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px 4px;
    border-bottom: 1px solid var(--line);
  }
  .scrs .i {
    color: var(--fg-3);
    font-size: 13px;
  }
  .scrs .s {
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-line;
    user-select: text;
  }
  .pv {
    width: 120px;
  }
  .pv :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .res {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
  }
  .rr {
    display: grid;
    grid-template-columns: 100px 24px 1fr;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
    align-items: baseline;
  }
  .rr:last-child {
    border-bottom: 0;
  }
  .lbl {
    color: var(--fg-3);
  }
  .len {
    font-weight: 600;
    text-align: right;
  }
  .sol {
    display: flex;
    flex-direction: column;
    gap: 2px;
    user-select: text;
  }
  .rot {
    color: var(--fg-3);
  }
  .calc {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 14px;
  }
  .calc div {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 12px;
  }
  .calc span {
    font-size: 11.5px;
    color: var(--fg-3);
  }
  .calc b {
    font-size: 20px;
    font-weight: 500;
    font-variant-numeric: proportional-nums;
  }
  .small {
    font-size: 12.5px;
    margin: 8px 0 0;
  }
  .metro {
    display: flex;
    align-items: center;
    gap: 32px;
    flex-wrap: wrap;
  }
  .beat {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 1.5px solid var(--fg);
    display: grid;
    place-items: center;
    transition: transform 0.1s;
  }
  .beat.on {
    background: var(--fg);
    color: var(--bg);
  }
  .beat:active {
    transform: scale(0.96);
  }
  .ctl {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  @media (max-width: 820px) {
    .two {
      grid-template-columns: 1fr;
    }
    .calc {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .print-title {
    font-size: 13px;
    font-weight: 600;
    margin: 16px 0 4px;
  }
  .print-title .muted {
    font-weight: 400;
  }
  @media print {
    .print-title {
      font-size: 16px;
      margin: 0 0 12px;
    }
    :global(.topbar),
    :global(nav.mobile),
    .page-title,
    .page-sub,
    header,
    .row,
    .two,
    .block:not(:first-of-type) {
      display: none !important;
    }
    .block {
      border: 0;
    }
  }
</style>
