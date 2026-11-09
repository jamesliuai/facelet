<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import { TimerEngine, type Phase } from '../../lib/timer/engine';
  import { trainer, type Mode } from '../../lib/trainer/trainer.svelte';
  import { fillerFor, type TCase, type TSet } from '../../lib/trainer/sets';
  import { caseSvg, faceColors } from '../../lib/render/case-svg';
  import { settings } from '../../lib/store/settings.svelte';
  import { ui, typingInField } from '../../lib/store/ui.svelte';
  import { call } from '../../lib/scramble/client';
  import { formatTime, formatRunning } from '../../lib/stats/format';
  import { shuffle, randInt } from '../../lib/rand';
  import type { Filler } from '../../lib/trainer/setup';
  import { haptic } from '../../lib/device';

  let { set, cases, mode, practiceAlg, onexit, onopen }: {
    set: TSet;
    cases: TCase[];
    mode: Mode;
    practiceAlg?: string;
    onexit: () => void;
    onopen: (c: TCase) => void;
  } = $props();

  type Item = { c: TCase; scramble: string };
  let current = $state<Item | null>(null);
  let upcoming: Promise<Item> | null = null;
  let phase = $state<Phase>('idle');
  let loading = $state(true);
  let now = $state(0);
  let last = $state<number | null>(null);
  let results = $state<{ c: TCase; t: number }[]>([]);
  let queue: TCase[] = [];
  let finished = $state(false);
  let raf = 0;

  let loadError = $state(false);
  let destroyed = false;
  const engine = new TimerEngine({ holdTime: settings.trainerHoldTime, inspection: false, inspectionMs: 15000, phases: 1 });
  engine.onPhase = (p) => {
    phase = p;
    // Focus mode hides the chrome during an attempt, like the main timer.
    ui.timing = p === 'ready' || p === 'running';
    if (p === 'ready' && settings.haptics) haptic(10);
    if (p === 'running' || p === 'holding' || p === 'ready') loop();
  };
  engine.onResult = (r) => {
    if (!current) return;
    last = r.time;
    trainer.record(current.c.id, r.time);
    results = [{ c: current.c, t: r.time }, ...results];
  };

  // One frame loop at a time: hold → ready happens inside a frame, which must not start a second loop.
  function loop() {
    if (raf || destroyed) return;
    const f = () => {
      now = performance.now();
      engine.tick(now);
      if (!destroyed && (engine.phase === 'holding' || engine.phase === 'ready' || engine.phase === 'running')) raf = requestAnimationFrame(f);
      else raf = 0;
    };
    raf = requestAnimationFrame(f);
  }

  function fillerOf(c: TCase): Filler {
    if (!settings.trainerFiller) return set.view === 'f2l' ? 'none' : 'auf';
    return fillerFor(set, c);
  }

  function pick(): TCase | null {
    if (mode === 'recap') {
      if (!queue.length) return null;
      return queue.shift()!;
    }
    if (cases.length === 1) return cases[0];
    if (mode === 'weighted') {
      const means = cases.map((c) => trainer.mean(c.id));
      let fallback = 0;
      for (const m of means) if (!Number.isNaN(m) && m > fallback) fallback = m;
      if (!fallback) fallback = 3000;
      // Slow and rarely-seen cases weigh more; the case just shown weighs nothing, so
      // its share is spread fairly instead of falling through to its neighbour.
      const w = cases.map((c, i) =>
        c.id === current?.c.id ? 0 : (Number.isNaN(means[i]) ? fallback * 1.4 : means[i]) * (1 + 2 / (trainer.timesOf(c.id).length + 1)),
      );
      const total = w.reduce((a, b) => a + b, 0);
      if (total > 0) {
        let r = Math.random() * total;
        for (let i = 0; i < cases.length; i++) {
          r -= w[i];
          if (r <= 0 && w[i] > 0) return cases[i];
        }
      }
    }
    let c: TCase;
    do c = cases[randInt(cases.length)];
    while (c.id === current?.c.id);
    return c;
  }

  async function make(c: TCase): Promise<Item> {
    const state = $state.snapshot(c.state);
    const scramble = await call<string>('case', { state, options: { filler: fillerOf(c), preAuf: true } });
    return { c, scramble };
  }

  async function next() {
    const c = upcoming ? null : pick();
    if (!upcoming && !c) {
      finished = true;
      return;
    }
    loading = true;
    loadError = false;
    last = null;
    try {
      const item = upcoming ? await upcoming : await make(c!);
      if (destroyed) return;
      current = item;
    } catch {
      upcoming = null;
      loadError = true;
      loading = false;
      return;
    }
    loading = false;
    phase = 'idle';
    // prefetch the next one
    const n = pick();
    upcoming = n ? make(n) : null;
    upcoming?.catch(() => {});
    if (!n && mode === 'recap') upcoming = null;
  }

  function discardLast() {
    const r = results[0];
    if (!r || last === null) return;
    trainer.discard(r.c.id, r.t);
    results = results.slice(1);
    last = null;
    ui.toast('Attempt discarded');
  }

  onMount(() => {
    if (mode === 'recap') queue = shuffle(cases.slice());
    void next();
  });
  onDestroy(() => {
    destroyed = true;
    cancelAnimationFrame(raf);
    raf = 0;
    engine.cancel();
    ui.timing = false;
  });

  function onkeydown(e: KeyboardEvent) {
    if (ui.modalDepth > 0 || ui.paletteOpen || typingInField(e)) return;
    if (e.key === 'Escape') {
      if (engine.phase !== 'idle' && engine.phase !== 'stopped') engine.cancel();
      else onexit();
      e.preventDefault();
      return;
    }
    if (finished) return;
    if (e.key === 'Enter' && last !== null && engine.phase === 'idle') {
      e.preventDefault();
      void next();
      return;
    }
    if (e.repeat) {
      if (e.code === 'Space') e.preventDefault();
      return;
    }
    if (loading) return;
    if (engine.phase === 'running') {
      // Cmd-Tab and friends shouldn't stop an attempt; neither should other keys in "Space only" mode.
      if (e.metaKey || e.ctrlKey) return;
      if (settings.stopKey === 'space' && e.code !== 'Space') return;
      e.preventDefault();
      engine.press(e.timeStamp || performance.now(), e.code === 'Space');
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (last !== null && engine.phase === 'idle') {
        void next();
        return;
      }
      engine.configure({ holdTime: settings.trainerHoldTime, inspection: false, inspectionMs: 15000, phases: 1 });
      engine.press(e.timeStamp || performance.now(), true);
    }
  }
  function onkeyup(e: KeyboardEvent) {
    if (engine.phase === 'idle') return;
    if (e.code === 'Space' || engine.phase === 'stopped') engine.release(e.timeStamp || performance.now());
  }
  // A tap that stops the clock must not also press the button under the finger.
  let swallowClick = false;
  function tap(e: PointerEvent) {
    if (e.pointerType === 'mouse' || loading || finished) return;
    if (engine.phase === 'running') {
      e.preventDefault();
      swallowClick = true;
      engine.press(e.timeStamp || performance.now(), true);
      return;
    }
    if ((e.target as HTMLElement).closest('button')) return;
    if (last !== null && engine.phase === 'idle') return void next();
    engine.press(e.timeStamp || performance.now(), true);
  }
  function untap(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    if (engine.phase !== 'idle') engine.release(e.timeStamp || performance.now());
  }
  function cancelTap() {
    if (engine.phase === 'holding' || engine.phase === 'ready') engine.abortHold();
  }
  function onclickcapture(e: MouseEvent) {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  const colors = $derived(faceColors(settings.cubeColors, settings.trainerYellowTop));
  const display = $derived(
    phase === 'running' ? formatRunning(Math.max(0, now - engine.start), 'full', 2) : phase === 'holding' || phase === 'ready' ? '0.00' : last !== null ? formatTime(last, 2) : '0.00',
  );
  const holdPct = $derived(
    phase === 'holding' ? Math.min(1, (now - engine.holdStart) / Math.max(1, settings.trainerHoldTime)) : phase === 'ready' ? 1 : 0,
  );
  // Seconds full size, decimals a step smaller (as on the timer).
  const dm = $derived(settings.smallDecimals ? /^(.*?)(\.\d+)$/.exec(display) : null);
  const revealed = $derived(last !== null && phase === 'idle');
  const showAlg = $derived(settings.trainerShowAlg === 'always' || (settings.trainerShowAlg === 'after' && revealed));
  const mean = $derived(results.length ? results.reduce((a, b) => a + b.t, 0) / results.length : NaN);
  const recapLeft = $derived(mode === 'recap' ? cases.length - results.length : 0);
  const summary = $derived.by(() => {
    const by = new Map<string, { c: TCase; ts: number[] }>();
    for (const r of results) {
      const e = by.get(r.c.id) ?? { c: r.c, ts: [] };
      e.ts.push(r.t);
      by.set(r.c.id, e);
    }
    return [...by.values()].map((e) => ({ c: e.c, t: e.ts.reduce((a, b) => a + b, 0) / e.ts.length })).sort((a, b) => b.t - a.t);
  });
</script>

<svelte:window {onkeydown} {onkeyup} onblur={cancelTap} />

<div class="train" onpointerdown={tap} onpointerup={untap} onpointercancel={cancelTap} {onclickcapture} role="application">
  <div class="bar">
    <button class="btn sm ghost" onclick={onexit}><Icon name="left" size={15} />Cases</button>
    <span class="chip">{set.name}</span>
    <span class="chip">{practiceAlg ? cases[0].name : mode === 'recap' ? `Recap · ${Math.max(0, recapLeft)} left` : mode === 'weighted' ? 'Weighted' : 'Random'}</span>
    <span class="grow"></span>
    <span class="muted num">{results.length} solves · mean {formatTime(mean, 2)}</span>
  </div>

  {#if finished}
    <div class="done">
      <h2>Recap complete</h2>
      <p class="muted">{results.length} cases · mean {formatTime(mean, 2)}. Slowest first:</p>
      <div class="sum">
        {#each summary as s}
          <button class="srow" onclick={() => onopen(s.c)}>
            <span class="mini">{@html caseSvg(s.c.state, set.view, colors, false)}</span>
            <span>{s.c.name}</span>
            <span class="num">{formatTime(s.t, 2)}</span>
          </button>
        {/each}
      </div>
      <div class="row">
        <button class="btn primary" onclick={() => { results = []; finished = false; queue = shuffle(cases.slice()); upcoming = null; void next(); }}>Recap again</button>
        <button class="btn" onclick={onexit}>Back to cases</button>
      </div>
    </div>
  {:else}
    {#if loadError}
      <div class="scramble">
        <span class="muted">Couldn't set up a case.</span>
        <button class="btn sm" onclick={() => next()}>Try again</button>
      </div>
    {:else}
      <div class="scramble mono" class:loading>{current?.scramble ?? 'Setting up a case…'}</div>
    {/if}
    <div class="clock num" class:hold={phase === 'holding'} class:ready={phase === 'ready'}>{#if dm}{dm[1]}<span class="dec">{dm[2]}</span>{:else}{display}{/if}</div>
    <div class="holdbar" aria-hidden="true"><div class="bar" class:full={phase === 'ready'} style="transform: scaleX({holdPct}); opacity: {holdPct > 0 ? 1 : 0}"></div></div>
    <div class="reveal" class:show={revealed || showAlg}>
      {#if current && (revealed || showAlg)}
        <button class="img" onclick={() => onopen(current!.c)} aria-label="Case details">{@html caseSvg(current.c.state, set.view, colors, set.view === 'll-pll')}</button>
        <div class="txt">
          <div class="name">{current.c.name} <span class="muted">· {current.c.group}</span></div>
          {#if showAlg}<div class="alg mono">{practiceAlg ?? trainer.mainAlg(current.c)}</div>{/if}
          {#if revealed}
            <div class="acts">
              <button class="btn sm" class:primary={trainer.status(current.c.id) === 'learning'} onclick={() => trainer.setStatus(current!.c.id, trainer.status(current!.c.id) === 'learning' ? 'new' : 'learning')}>Learning</button>
              <button class="btn sm" class:primary={trainer.status(current.c.id) === 'learned'} onclick={() => trainer.setStatus(current!.c.id, trainer.status(current!.c.id) === 'learned' ? 'new' : 'learned')}>Learned</button>
              <button class="btn sm ghost" onclick={discardLast} title="Throw away this attempt (a mis-stop)">Discard</button>
              <button class="btn sm primary" onclick={() => next()}>Next <span class="k">Space</span></button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <p class="hint">Hold <span class="kbd">Space</span> to start, any key to stop · scramble with {settings.trainerYellowTop ? 'yellow' : 'white'} on top, green in front</p>
  {/if}
</div>

{#if results.length && !finished}
  <aside class="recent">
    {#each results.slice(0, 14) as r}
      <button class="rr num" onclick={() => onopen(r.c)}><span>{r.c.name}</span><span>{formatTime(r.t, 2)}</span></button>
    {/each}
  </aside>
{/if}

<style>
  .train {
    min-height: calc(100vh - var(--topbar-h) - 120px);
    display: flex;
    flex-direction: column;
    align-items: center;
    touch-action: manipulation;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-bottom: 28px;
  }
  .grow {
    flex: 1;
  }
  .scramble {
    font-size: 21px;
    text-align: center;
    max-width: 760px;
    line-height: 1.55;
    min-height: 1.6em;
    transition: opacity 0.2s;
    user-select: text;
  }
  .scramble.loading {
    opacity: 0.35;
  }
  .clock {
    margin-top: 36px;
    font-size: clamp(72px, 11vw, 150px);
    font-weight: 300;
    letter-spacing: -0.045em;
    line-height: 1;
  }
  .clock {
    transition: color 0.12s linear, transform 0.22s var(--spring);
  }
  .clock .dec {
    font-size: 0.6em;
    letter-spacing: -0.03em;
  }
  .clock.hold {
    color: var(--t-hold);
  }
  .clock.ready {
    color: var(--t-ready);
    transform: scale(1.015);
  }
  .holdbar {
    width: 120px;
    height: 3px;
    margin-top: 6px;
    border-radius: 3px;
    overflow: hidden;
  }
  .holdbar .bar {
    height: 100%;
    border-radius: 3px;
    background: var(--t-hold);
    transform-origin: left;
    transition: opacity 0.15s;
  }
  .holdbar .bar.full {
    background: var(--t-ready);
  }
  .reveal {
    margin-top: 30px;
    min-height: 150px;
    display: flex;
    gap: 22px;
    align-items: center;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .reveal.show {
    opacity: 1;
  }
  .img {
    width: 128px;
    flex: none;
  }
  .img :global(svg),
  .mini :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
  .name {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .name .muted {
    font-weight: 400;
    font-size: 14px;
  }
  .alg {
    font-size: 16px;
    margin-top: 6px;
    user-select: text;
  }
  .acts {
    display: flex;
    gap: 6px;
    margin-top: 14px;
  }
  .k {
    font-family: var(--mono);
    font-size: 10.5px;
    opacity: 0.6;
  }
  .hint {
    margin-top: auto;
    padding-top: 30px;
    color: var(--fg-3);
    font-size: 12.5px;
    text-align: center;
  }
  .recent {
    position: fixed;
    right: 24px;
    top: calc(var(--topbar-h) + 110px);
    width: 180px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rr {
    display: flex;
    justify-content: space-between;
    height: 28px;
    padding: 0 10px;
    border-radius: 7px;
    font-size: 12.5px;
    color: var(--fg-2);
  }
  .rr:hover {
    background: var(--bg-hover);
  }
  .done {
    width: 100%;
    max-width: 560px;
  }
  .done h2 {
    margin: 0 0 4px;
    font-size: 22px;
  }
  .sum {
    margin: 16px 0 20px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .srow {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-radius: 10px;
    text-align: left;
  }
  .srow:hover {
    background: var(--bg-hover);
  }
  .mini {
    width: 44px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  @media (max-width: 1100px) {
    .recent {
      display: none;
    }
  }
  @media (max-width: 600px) {
    .reveal {
      flex-direction: column;
      text-align: center;
    }
    .acts {
      justify-content: center;
      flex-wrap: wrap;
    }
  }
</style>
