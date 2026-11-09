<script lang="ts">
  import { timer } from '../../lib/timer/timer.svelte';
  import { settings } from '../../lib/store/settings.svelte';
  import { sessions } from '../../lib/store/sessions.svelte';
  import { ui } from '../../lib/store/ui.svelte';
  import { formatTime, formatRunning, formatSolve } from '../../lib/stats/format';
  import { neededForBest, parseAvgSpec } from '../../lib/stats/stats';
  import { setLastPenalty, deleteLast } from '../../lib/commands';
  import { isTouchDevice } from '../../lib/device';
  import Icon from '../../components/Icon.svelte';
  import LcdDigits from '../../components/LcdDigits.svelte';
  import SolveModal from './SolveModal.svelte';

  const phase = $derived(timer.phase);
  const insp = $derived(timer.inspecting);
  const last = $derived(sessions.solves.length ? sessions.solves[sessions.solves.length - 1] : null);
  const limit = $derived(settings.inspectionTime * 1000);
  const p = $derived(settings.precision);

  const display = $derived.by(() => {
    void sessions.version;
    if (phase === 'running') {
      if (settings.timerUpdate === 'hidden') return 'solve';
      return formatRunning(Math.max(0, timer.now - timer.engine.start), settings.timerUpdate, p);
    }
    if (insp && (phase === 'inspecting' || phase === 'holding' || phase === 'ready')) {
      const used = Math.max(0, timer.now - timer.engine.inspectStart);
      if (used >= limit + 2000) return 'DNF';
      if (used >= limit) return '+2';
      return String(Math.ceil((limit - used) / 1000));
    }
    if (phase === 'ready' || phase === 'holding' || phase === 'armInspect') return formatTime(0, p);
    if (last) return formatSolve(last, p);
    return formatTime(0, p);
  });

  // Chronograph style: seconds at full size, the decimals a step smaller.
  const DEC = 0.6;
  const parts = $derived.by(() => {
    const m = settings.smallDecimals && settings.timerFont !== 'lcd' ? /^(.*?)(\.\d+)(\+?)$/.exec(display) : null;
    return m ? { int: m[1], dec: m[2], suf: m[3] } : null;
  });

  const holdPct = $derived(
    phase === 'holding' ? Math.min(1, (timer.now - timer.engine.holdStart) / Math.max(1, settings.holdTime)) : phase === 'ready' ? 1 : 0,
  );
  const tone = $derived(phase === 'holding' ? 'hold' : phase === 'ready' ? 'ready' : phase === 'running' ? 'run' : insp ? 'insp' : 'idle');

  // Width of the text in ems, so the clock can fill narrow screens without overflowing.
  // Never smaller than "00.00", so the size doesn't jump when a solve passes ten seconds.
  function ems(t: string, small = false): number {
    const lcd = settings.timerFont === 'lcd';
    const m = small && !lcd ? /^(.*?)(\.\d+)(\+?)$/.exec(t) : null;
    if (m) return ems(m[1]) + ems(m[2]) * DEC + ems(m[3]);
    let w = 0;
    for (const c of t) w += c === '.' || c === ':' ? (lcd ? 0.16 : 0.3) : lcd ? 0.52 : 0.6;
    return w;
  }
  const widthEm = $derived(Math.max(ems(display, settings.smallDecimals), ems(p === 3 ? '00.000' : '00.00', settings.smallDecimals), 1.6));

  // live splits while running, or the last solve's splits
  const splits = $derived.by(() => {
    if (settings.phases <= 1) return [] as number[];
    if (phase === 'running') return timer.engine.splits;
    return last?.splits ?? [];
  });

  // ------------------------------------------------------------ stats under the time
  const stripLabels = $derived.by(() => {
    const labels = settings.stripStats.slice();
    // Big cubes, FMC and BLD are ranked by mean of 3.
    if (sessions.event.format !== 'ao5' && !labels.includes('mo3')) labels.unshift('mo3');
    return labels.slice(0, 4);
  });
  const strip = $derived.by(() => {
    void sessions.version;
    const e = sessions.engine;
    const out: { label: string; value: string; pb: boolean }[] = [];
    for (const l of stripLabels) {
      let v = NaN;
      let text = '';
      if (l === 'mean') v = e.mean;
      else if (l === 'best') v = e.best;
      else if (l === 'count') text = String(e.count);
      else v = e.current(l);
      if (!text && Number.isNaN(v)) continue;
      out.push({ label: l === 'count' ? 'solves' : l, value: text || formatTime(v, p), pb: timer.lastPbs.includes(l) });
    }
    return out;
  });

  // "11.82 or faster for a new best ao5" — only when it's within reach (no faster than your best single).
  const pbHint = $derived.by(() => {
    void sessions.version;
    if (!settings.showPbHint || phase !== 'idle') return null;
    const e = sessions.engine;
    for (const l of stripLabels) {
      const spec = parseAvgSpec(l);
      const series = spec && e.seriesFor(l);
      if (!spec || !series || spec.n < 5) continue;
      const need = neededForBest(e.values, spec, settings.trimPct, p, series.best);
      if (need == null) continue;
      if (need === Infinity) return { label: l, text: 'Any time' };
      if (Number.isFinite(e.best) && need < e.best) continue;
      return { label: l, text: formatTime(need, p) };
    }
    return null;
  });

  let shine = $state(false);
  $effect(() => {
    if (!ui.celebration || !ui.celebration.pbs.length) return;
    shine = true;
    const t = setTimeout(() => (shine = false), 1600);
    return () => clearTimeout(t);
  });

  // ------------------------------------------------------------ focus: glide to the true centre
  // With the interface hidden, the digits move to the middle of the screen rather than
  // staying centred in the (now invisible) layout.
  const focused = $derived(ui.timing && settings.focusMode);
  let wrapEl: HTMLDivElement | undefined = $state();
  let glideEl: HTMLDivElement | undefined = $state();
  let digitsEl: HTMLDivElement | undefined = $state();
  let shift = $state({ x: 0, y: 0 });

  function recenter() {
    if (!focused || !wrapEl || !glideEl || !digitsEl) {
      shift = { x: 0, y: 0 };
      return;
    }
    // Offsets ignore transforms, so this is the resting position even mid-glide.
    const r = wrapEl.getBoundingClientRect();
    const cx = r.left + glideEl.offsetLeft + digitsEl.offsetLeft + digitsEl.offsetWidth / 2;
    const cy = r.top + glideEl.offsetTop + digitsEl.offsetTop + digitsEl.offsetHeight / 2;
    const vv = window.visualViewport;
    const w = vv?.width ?? window.innerWidth;
    const h = vv?.height ?? window.innerHeight;
    shift = { x: Math.round(w / 2 - cx), y: Math.round(h / 2 - cy) };
  }
  $effect(() => {
    void focused;
    void (display === 'solve');
    recenter();
  });

  let typed = $state('');
  let typedBad = $state(false);
  async function submitTyped(e: SubmitEvent) {
    e.preventDefault();
    if (!typed.trim()) return;
    const ok = await timer.submitTyped(typed);
    typedBad = !ok;
    if (ok) typed = '';
  }

  let openSolve = $state(false);
  let commentOpen = $state(false);
  const showLast = $derived(!!last && phase === 'idle' && settings.showLastSolveBar && settings.inputMode === 'timer');
  const fresh = $derived(sessions.solves.length === 0 && phase === 'idle' && settings.inputMode === 'timer');
  const startHint = $derived(
    isTouchDevice
      ? settings.inspection ? 'Tap to inspect, then hold and release to start' : 'Hold anywhere, release to start'
      : settings.inspection ? 'Press Space to inspect, then hold and release to start' : 'Hold Space, release to start',
  );

  const TICKS = 15;
</script>

<svelte:window onresize={recenter} />

<div class="clock-wrap" bind:this={wrapEl} style="--w:{widthEm}; --ts:{settings.timerSize}; --dec:{DEC}">
  {#if settings.inputMode === 'typing' && !insp}
    <form class="typing" onsubmit={submitTyped}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="type-in num font-{settings.timerFont}"
        class:bad={typedBad}
        style="font-weight:{settings.timerWeight}"
        bind:value={typed}
        oninput={() => (typedBad = false)}
        placeholder={last ? formatSolve(last, p) : '0.00'}
        inputmode="decimal"
        autocomplete="off"
        spellcheck="false"
        aria-label="Type a time"
        autofocus
      />
      <p class="hint">Type a time and press Enter · <span class="mono">1234</span> = 12.34 · add <span class="mono">+</span> for +2 or type <span class="mono">dnf</span></p>
    </form>
  {:else}
    <div class="glide" class:focused bind:this={glideEl} data-glide style="transform: translate3d({shift.x}px, {shift.y}px, 0)">
      {#if settings.spotlight}<div class="spot" class:lit={focused} aria-hidden="true"></div>{/if}
      <div
        class="clock num {tone} font-{settings.timerFont}"
        class:shine
        class:small={display === 'solve'}
        style="font-weight:{settings.timerFont === 'serif' ? 400 : settings.timerWeight}"
        bind:this={digitsEl}
        data-timer-anchor
        aria-hidden="true"
      >
        {#if settings.timerFont === 'lcd' && display !== 'solve'}<LcdDigits text={display} />{:else if parts}{parts.int}<span class="dec">{parts.dec}</span>{parts.suf}{:else}{display}{/if}
      </div>
      <!-- Hold indicator: fine ticks light from the centre out; all lit means ready. -->
      <div class="hold" class:on={holdPct > 0} class:full={phase === 'ready'} aria-hidden="true">
        {#each Array(TICKS) as _, i}
          {@const d = Math.abs(i - (TICKS - 1) / 2) / ((TICKS - 1) / 2)}
          <i class:lit={holdPct >= d * 0.94 + 0.02}></i>
        {/each}
      </div>
      {#if insp && phase !== 'running'}
        <div class="sub label">Inspection</div>
      {:else if splits.length}
        <div class="sub num">
          {#each splits as s, i}<span>{formatTime(i === 0 ? s : s - splits[i - 1], p)}</span>{/each}
          {#if phase !== 'running' && last}<span>{formatTime(last.time - (splits[splits.length - 1] ?? 0), p)}</span>{/if}
        </div>
      {/if}
    </div>
  {/if}
  <div class="sr-only" aria-live="polite">{timer.announcement}</div>

  <div class="below" class:hidden={phase !== 'idle'}>
    {#if strip.length}
      <div class="strip num">
        {#each strip as s (s.label)}
          <div class="stat" class:pb={s.pb}>
            <span class="k">{s.label}</span>
            <span class="v">{s.value}</span>
          </div>
        {/each}
      </div>
    {/if}
    {#if pbHint}
      <div class="target num"><b>{pbHint.text}</b>{pbHint.text === 'Any time' ? ' sets' : ' or faster for'} a new best {pbHint.label}</div>
    {/if}
    {#if showLast && last}
      <div class="last" data-no-timer>
        <div class="pens" role="group" aria-label="Penalty">
          <button class="pill" class:on={last.penalty === 0} onclick={() => setLastPenalty(0)} title="No penalty (Alt 1)">OK</button>
          <button class="pill" class:on={last.penalty > 0} onclick={() => setLastPenalty(last.penalty > 0 ? 0 : 2000)} title="+2 (Alt 2)">+2</button>
          <button class="pill" class:on={last.penalty < 0} onclick={() => setLastPenalty(last.penalty < 0 ? 0 : -1)} title="DNF (Alt 3)">DNF</button>
        </div>
        <div class="acts">
          <button class="icon-btn sm" onclick={() => { commentOpen = true; openSolve = true; }} title="Comment" aria-label="Comment"><Icon name="message" size={15} /></button>
          <button class="icon-btn sm" onclick={() => (openSolve = true)} title="Details" aria-label="Solve details"><Icon name="info" size={15} /></button>
          <button class="icon-btn sm" onclick={deleteLast} title="Delete (Alt ⌫)" aria-label="Delete solve"><Icon name="trash" size={15} /></button>
        </div>
      </div>
    {:else if fresh}
      <div class="onboard">
        {#if !isTouchDevice}<span class="kbd">Space</span>{/if}
        <span>{startHint}</span>
      </div>
    {/if}
  </div>
</div>

{#if last}
  <SolveModal bind:open={openSolve} solveId={last.id} focusComment={commentOpen} onclose={() => (commentOpen = false)} />
{/if}

<style>
  .clock-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .glide {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%;
    transition: transform 0.6s var(--glide);
    will-change: transform;
  }
  /* A soft light falls on the digits, like a product on a lit stage. */
  .spot {
    position: absolute;
    left: 50%;
    top: 46%;
    width: min(120cqi, 1100px);
    aspect-ratio: 2.1;
    transform: translate(-50%, -50%);
    background: radial-gradient(closest-side, var(--bg), color-mix(in srgb, var(--bg) 55%, transparent) 45%, transparent);
    opacity: 0.9;
    pointer-events: none;
    z-index: -1;
    transition: opacity 0.6s var(--ease), transform 0.8s var(--glide);
  }
  .spot.lit {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.12);
  }
  .clock {
    /* Fill narrow screens, cap on large ones; the size slider scales within that. */
    font-size: min(calc(min(212px, 30vh) * var(--ts)), calc(92cqi / var(--w)));
    line-height: 1;
    letter-spacing: -0.045em;
    color: var(--fg);
    transition: color 0.12s linear, transform 0.22s var(--spring);
    white-space: nowrap;
    padding: 0.08em 0.06em;
    font-feature-settings: 'tnum' on, 'ss01' on;
  }
  .dec {
    font-size: calc(var(--dec) * 1em);
    letter-spacing: -0.03em;
    margin-left: 0.02em;
  }
  .font-mono {
    font-family: var(--mono);
    letter-spacing: -0.06em;
  }
  .font-serif {
    font-family: var(--serif);
    letter-spacing: -0.02em;
  }
  .clock.font-serif {
    font-size: min(calc(min(232px, 33vh) * var(--ts)), calc(100cqi / var(--w)));
  }
  .font-system {
    font-family: var(--system);
    letter-spacing: -0.035em;
  }
  .clock.font-lcd {
    padding: 0.14em 0.06em 0.1em;
    letter-spacing: 0;
  }
  .clock.small {
    font-size: min(calc(min(88px, 13vh) * var(--ts)), 14cqi) !important;
    letter-spacing: 0;
    color: var(--fg-3);
    padding: 0.6em 0;
  }
  .clock.hold {
    color: var(--t-hold);
  }
  .clock.ready {
    color: var(--t-ready);
    transform: scale(1.015);
  }
  .clock.shine {
    background: linear-gradient(100deg, var(--fg) 38%, var(--fg-4) 50%, var(--fg) 62%);
    background-size: 300% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: sweep 1.4s var(--ease) 1;
  }
  :global(:root[data-accent='on']) .clock.shine {
    background-image: linear-gradient(100deg, var(--fg) 38%, var(--accent) 50%, var(--fg) 62%);
  }
  @keyframes sweep {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0% 0;
    }
  }

  .hold {
    display: flex;
    gap: 5px;
    height: 9px;
    margin-top: 4px;
    align-items: center;
    opacity: 0;
    transition: opacity 0.2s var(--ease);
  }
  .hold.on {
    opacity: 1;
  }
  .hold i {
    width: 2px;
    height: 9px;
    border-radius: 1px;
    background: var(--fg-5);
    transition: background-color 0.08s linear, transform 0.25s var(--spring);
  }
  .hold i.lit {
    background: var(--t-hold);
  }
  .hold.full i {
    background: var(--t-ready);
    transform: scaleY(1.25);
  }

  .sub {
    margin-top: 10px;
    display: flex;
    gap: 14px;
    font-size: 13px;
    color: var(--fg-3);
  }
  .sub.label {
    font-size: 11px;
  }
  .below {
    margin-top: 22px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    transition: opacity 0.3s var(--ease), transform 0.45s var(--glide);
    min-height: 92px;
  }
  .below.hidden {
    opacity: 0;
    transform: translateY(6px);
    pointer-events: none;
  }

  /* Readouts: an instrument label over each value, hairlines between. */
  .strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px 0;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 0 22px;
    position: relative;
  }
  .stat + .stat::before {
    content: '';
    position: absolute;
    left: 0;
    top: 3px;
    bottom: 3px;
    width: 1px;
    background: var(--line-2);
  }
  .stat .k {
    font-family: var(--mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--fg-3);
  }
  .stat .v {
    font-size: 18px;
    letter-spacing: -0.01em;
    color: var(--fg);
  }
  .stat.pb .k {
    color: var(--accent);
  }
  .stat.pb .k::after {
    content: ' · PB';
  }
  .stat.pb .v {
    font-weight: 600;
    color: var(--accent);
  }
  .target {
    margin-top: -4px;
    font-size: 13px;
    color: var(--fg-3);
  }
  .target b {
    font-weight: 600;
    color: var(--fg-2);
  }
  .last {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pens,
  .acts {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 12px;
    background: var(--bg);
    border: 1px solid var(--line);
    box-shadow: var(--hi), var(--shadow-sm);
  }
  .acts {
    padding: 4px;
  }
  .pill {
    height: 26px;
    min-width: 40px;
    padding: 0 11px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--mono);
    letter-spacing: 0.02em;
    color: var(--fg-3);
    transition: color 0.15s, background 0.15s, transform 0.14s var(--ease);
  }
  .pill:hover {
    color: var(--fg);
    background: var(--bg-hover);
  }
  .pill:active {
    transform: scale(0.95);
  }
  .pill.on {
    color: var(--fg);
    background: var(--bg-3);
  }
  .onboard {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13.5px;
    color: var(--fg-3);
    animation: rise 0.6s 0.2s var(--ease-out) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  .typing {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .type-in {
    width: min(720px, 92%);
    font-size: min(calc(min(180px, 26vh) * var(--ts)), 22cqi);
    text-align: center;
    border: 0;
    border-bottom: 1.5px solid var(--line-2);
    border-radius: 0;
    background: transparent;
    outline: none;
    letter-spacing: -0.04em;
    line-height: 1.1;
    padding: 0 0 6px;
    transition: border-color 0.15s;
  }
  .type-in.font-lcd {
    font-family: var(--mono);
  }
  .type-in:focus {
    border-color: var(--accent);
  }
  .type-in.bad {
    border-color: var(--fg);
    animation: shake 0.3s;
  }
  .type-in::placeholder {
    color: var(--fg-5);
  }
  .hint {
    color: var(--fg-3);
    font-size: 12.5px;
    margin-top: 14px;
    text-align: center;
  }
  @keyframes shake {
    25% {
      transform: translateX(-6px);
    }
    75% {
      transform: translateX(6px);
    }
  }
  @media (max-width: 720px) {
    .stat {
      padding: 0 16px;
    }
    .stat .v {
      font-size: 17px;
    }
    .below {
      margin-top: 16px;
    }
  }
</style>
