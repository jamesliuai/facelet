<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import Modal from '../components/Modal.svelte';
  import { VirtualCube, KEYMAP } from '../lib/vcube/controller';
  import { settings } from '../lib/store/settings.svelte';
  import { sessions, type Solve, type Session } from '../lib/store/sessions.svelte';
  import { ui, typingInField } from '../lib/store/ui.svelte';
  import { nextScramble } from '../lib/scramble/client';
  import { StatsEngine } from '../lib/stats/engine';
  import { solveValue } from '../lib/stats/stats';
  import { formatTime, formatRunning } from '../lib/stats/format';
  import { StickerCube } from '../lib/cube/nxn';
  import { nxnStateSvg } from '../lib/render/scramble-svg';
  import { alert as inspectAlert, unlockAudio } from '../lib/timer/audio';
  import { parseAlg, resolve } from '../lib/cube/alg';
  import { prefersReducedMotion } from '../lib/store/settings.svelte';

  type Phase = 'free' | 'scrambling' | 'inspect' | 'ready' | 'solving' | 'done';

  let canvas: HTMLCanvasElement | undefined = $state();
  let wrap: HTMLDivElement | undefined = $state();
  let cube: VirtualCube | null = null;
  let glError = $state('');

  let phase = $state<Phase>('free');
  let scramble = $state('');
  let start = 0;
  let inspectStart = 0;
  let now = $state(0);
  let moves = $state(0);
  let recon: string[] = [];
  let result = $state<{ time: number; moves: number; penalty: number } | null>(null);
  let netSvg = $state('');
  let showKeys = $state(false);
  let historyOpen = $state(false);
  let raf = 0;

  // virtual session
  let session = $state<Session | null>(null);
  let solves: Solve[] = $state.raw([]);
  const engine = new StatsEngine();
  let ver = $state(0);

  const size = $derived(settings.vcSize);
  const evId = $derived(`v${size}${size}${size}`);

  async function loadSession() {
    session = await sessions.ensureSession(evId, `Virtual ${size}x${size}`);
    solves = await sessions.solvesOf(session.id);
    engine.configure(['ao5', 'ao12', 'ao100'], settings.trimPct, settings.precision);
    engine.reset(solves.map((s) => solveValue(s, settings.precision)));
    ver++;
  }

  function updateNet() {
    if (!cube || !settings.vcMirrorHints) return;
    const sc = new StickerCube(cube.n, cube.logic.facelets());
    netSvg = nxnStateSvg(sc, settings.cubeColors);
  }

  function loop() {
    now = performance.now();
    if (phase === 'inspect') {
      const secs = (now - inspectStart) / 1000;
      for (const m of [8, 12]) if (secs >= m && !alerted.has(m)) {
        alerted.add(m);
        inspectAlert(settings.inspectionAlerts, m);
      }
    }
    if (phase === 'solving' || phase === 'inspect') raf = requestAnimationFrame(loop);
    else raf = 0;
  }
  const alerted = new Set<number>();
  function kick() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  async function doScramble() {
    if (!cube) return;
    unlockAudio();
    phase = 'scrambling';
    result = null;
    cube.reset();
    let scr = '';
    try {
      scr = await nextScramble(evId, size === 2 || size === 3 ? 'wca' : 'rm');
    } catch {
      ui.toast('Could not generate a scramble');
      phase = 'free';
      return;
    }
    scramble = scr;
    cube.applyInstant(scr);
    moves = 0;
    recon = [];
    updateNet();
    if (settings.vcInspection) {
      phase = 'inspect';
      inspectStart = performance.now();
      alerted.clear();
      kick();
    } else phase = 'ready';
  }

  function reset() {
    if (!cube) return;
    const was = phase;
    if (replaying) stopReplay();
    cube.reset();
    phase = 'free';
    scramble = '';
    moves = 0;
    result = null;
    updateNet();
    if (was === 'solving') ui.toast('Solve abandoned');
  }

  async function finish(t: number) {
    const time = Math.round(t - start);
    let penalty = 0;
    if (settings.vcInspection && inspectStart) {
      const used = start - inspectStart;
      const lim = settings.inspectionTime * 1000;
      penalty = used >= lim + 2000 ? -1 : used >= lim ? 2000 : 0;
    }
    phase = 'done';
    result = { time, moves, penalty };
    if (!session) await loadSession();
    const { solve } = await sessions.add({ time, penalty, scramble, moves, recon: recon.join(' ') }, session!.id);
    solves = [...solves, solve];
    const pbs = engine.append(solveValue(solve, settings.precision));
    ver++;
    if (settings.celebrate && pbs.length && solves.length > settings.celebrateMin) ui.celebrate(pbs);
  }

  function onTurn(name: string, rotation: boolean, t: number) {
    if (phase === 'inspect' || phase === 'ready') {
      if (rotation) {
        // Rotating during inspection doesn't start the clock, but the replay needs it.
        recon.push(`${name}@0`);
        updateNet();
        return;
      }
      start = t;
      phase = 'solving';
      kick();
    }
    if (phase === 'solving') {
      moves += rotation ? 0 : 1;
      recon.push(`${name}@${Math.round(t - start)}`);
      if (cube!.logic.isSolved()) void finish(t);
    }
    updateNet();
  }

  onMount(() => {
    if (!canvas || !wrap) return;
    try {
      cube = new VirtualCube(canvas, settings.vcSize);
    } catch (e) {
      glError = (e as Error).message;
      return;
    }
    cube.turnMs = prefersReducedMotion() ? 0 : settings.vcTurnMs;
    cube.stickerless = settings.vcStickerless;
    cube.setColors(settings.cubeColors);
    cube.onTurn = (e) => onTurn(e.name, e.rotation, e.t);
    const ro = new ResizeObserver(() => {
      const r = wrap!.getBoundingClientRect();
      cube?.resize(r.width, r.height);
    });
    ro.observe(wrap);
    const lost = (e: Event) => e.preventDefault(); // allow the browser to restore it
    const restored = () => {
      try {
        cube?.restore();
      } catch (err) {
        glError = (err as Error).message;
      }
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    void loadSession();
    updateNet();
    return () => {
      ro.disconnect();
      canvas?.removeEventListener('webglcontextlost', lost);
      canvas?.removeEventListener('webglcontextrestored', restored);
      cancelAnimationFrame(raf);
      cube?.dispose();
      cube = null;
    };
  });

  // react to settings
  $effect(() => {
    const n = settings.vcSize;
    if (cube && cube.n !== n) {
      if (untrack(() => phase) === 'solving') ui.toast('Solve abandoned');
      if (untrack(() => replaying)) stopReplay();
      cube.setSize(n);
      phase = 'free';
      scramble = '';
      result = null;
      updateNet();
      void loadSession();
    }
  });
  $effect(() => {
    const ms = settings.vcTurnMs;
    if (cube) cube.turnMs = prefersReducedMotion() ? 0 : ms;
  });
  $effect(() => {
    const c = settings.cubeColors.join();
    void c;
    cube?.setColors(settings.cubeColors);
    updateNet();
  });
  $effect(() => {
    const s = settings.vcStickerless;
    if (cube) {
      cube.stickerless = s;
      cube.request();
    }
  });
  $effect(() => {
    const dark = ui.dark;
    if (cube) {
      cube.renderer.dark = dark;
      cube.request();
    }
  });
  $effect(() => {
    if (settings.vcMirrorHints) updateNet();
  });

  function onkeydown(e: KeyboardEvent) {
    if (!cube || ui.modalDepth > 0 || ui.paletteOpen || typingInField(e)) return;
    if (replaying) {
      if (e.key === 'Escape') {
        e.preventDefault();
        reset();
      }
      return;
    }
    // Turning while the scramble is on its way would corrupt the scrambled state.
    if (phase === 'scrambling') {
      if (e.code === 'Space') e.preventDefault();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (phase !== 'solving') void doScramble();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      reset();
      return;
    }
    if (cube.key(e, settings.vcKeyMode)) e.preventDefault();
  }

  function pos(e: PointerEvent) {
    const r = wrap!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  }
  function pdown(e: PointerEvent) {
    if (!cube || replaying || phase === 'scrambling') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    cube.pointerDown(x, y);
  }
  function pmove(e: PointerEvent) {
    if (!cube) return;
    const [x, y] = pos(e);
    cube.pointerMove(x, y);
  }
  function pup() {
    cube?.pointerUp();
  }

  const display = $derived.by(() => {
    if (replaying) return formatRunning(Math.max(0, replayClockShown), 'full', settings.precision);
    if (phase === 'solving') return formatRunning(now - start, 'full', settings.precision);
    if (phase === 'inspect') {
      const used = now - inspectStart;
      const lim = settings.inspectionTime * 1000;
      return used >= lim + 2000 ? 'DNF' : used >= lim ? '+2' : String(Math.ceil((lim - used) / 1000));
    }
    if (result) return result.penalty < 0 ? 'DNF' : formatTime(result.time + result.penalty, settings.precision) + (result.penalty > 0 ? '+' : '');
    return formatTime(0, settings.precision);
  });
  const tps = $derived(result ? (result.moves / (result.time / 1000)).toFixed(2) : phase === 'solving' && now > start ? (moves / ((now - start) / 1000)).toFixed(2) : '');

  const stats = $derived.by(() => {
    void ver;
    return {
      best: engine.best,
      ao5: engine.current('ao5'),
      ao12: engine.current('ao12'),
      bestAo5: engine.seriesFor('ao5')?.best ?? NaN,
      count: engine.count,
    };
  });

  // ---------------------------------------------------------------- replay
  let replaying = $state(false);
  let replayOpen = $state(false);
  let replaySolve = $state<Solve | null>(null);
  let replayPos = $state(0);
  let replaySpeed = $state(1);
  let replayTimer = 0;
  let replayClock = 0;
  let replayT = 0;
  let replayMoves = $state.raw<{ name: string; t: number }[]>([]);
  let replayClockShown = $state(0);

  function startReplay(s: Solve) {
    if (!cube || !s.recon) return;
    if (phase === 'solving') ui.toast('Solve abandoned');
    replaySolve = s;
    replayMoves = s.recon.split(' ').filter(Boolean).map((x) => {
      const [name, t] = x.split('@');
      return { name, t: parseInt(t, 10) };
    });
    replayOpen = false;
    replaying = true;
    phase = 'free';
    result = null;
    cube.reset();
    cube.applyInstant(s.scramble);
    replayPos = 0;
    replayT = 0;
    scramble = s.scramble;
    updateNet();
    replayClock = performance.now();
    tickReplay();
  }
  function tickReplay() {
    if (!cube || !replaying) return;
    const t = performance.now();
    replayT += (t - replayClock) * replaySpeed;
    replayClock = t;
    while (replayPos < replayMoves.length && replayMoves[replayPos].t <= replayT) {
      try {
        const tok = parseAlg(replayMoves[replayPos].name)[0];
        const m = tok ? resolve(tok, cube.n) : null;
        if (m) cube.turn(m, false);
      } catch {
        /* a move recorded by an older version: skip it rather than freeze the replay */
      }
      replayPos++;
    }
    now = t;
    const lastT = replayMoves.length ? replayMoves[replayMoves.length - 1].t : 0;
    replayClockShown = Math.min(replayT, replaySolve?.time ?? lastT);
    if (replayPos >= replayMoves.length) {
      replayClockShown = replaySolve?.time ?? lastT;
      replaying = false;
      updateNet();
      return;
    }
    replayTimer = requestAnimationFrame(tickReplay);
  }
  function stopReplay() {
    replaying = false;
    cancelAnimationFrame(replayTimer);
  }

  const recent = $derived.by(() => {
    void ver;
    return solves.slice(-40).reverse();
  });
  const keyRows = Object.entries(KEYMAP);
</script>

<svelte:window {onkeydown} />

<div class="cube-page">
  <aside class="side">
    <div class="side-head">
      <span class="vtitle">Virtual {size}×{size}</span>
      <span class="muted num">{stats.count} solves</span>
    </div>
    <div class="kpis num">
      <div><span>best</span><b>{formatTime(stats.best, settings.precision)}</b></div>
      <div><span>ao5</span><b>{formatTime(stats.ao5, settings.precision)}</b></div>
      <div><span>ao12</span><b>{formatTime(stats.ao12, settings.precision)}</b></div>
      <div><span>best ao5</span><b>{formatTime(stats.bestAo5, settings.precision)}</b></div>
    </div>
    <div class="recent">
      {#each recent as s (s.id)}
        <button class="rs num" onclick={() => { replaySolve = s; replayOpen = true; }}>
          <span class="t">{s.penalty < 0 ? 'DNF' : formatTime(s.time + s.penalty, settings.precision)}</span>
          <span class="m">{s.moves ?? '–'} mv</span>
          <span class="m">{s.moves ? (s.moves / (s.time / 1000)).toFixed(1) : '–'} tps</span>
        </button>
      {:else}
        <p class="muted empty">Press <span class="kbd">Space</span> to scramble, then solve. The timer starts on your first turn.</p>
      {/each}
    </div>
  </aside>

  <section class="main">
    <div class="toolbar">
      <Segmented value={settings.vcSize} options={[2, 3, 4, 5].map((n) => ({ value: n, label: `${n}×${n}` }))} onchange={(v) => (settings.vcSize = v)} size="sm" />
      <div class="spacer"></div>
      <button class="btn sm primary" onclick={doScramble} disabled={phase === 'solving' || phase === 'scrambling' || replaying}><Icon name="shuffle" size={14} />Scramble <span class="k">Space</span></button>
      <button class="btn sm" onclick={reset}><Icon name="refresh" size={14} />Reset <span class="k">Esc</span></button>
      <button class="icon-btn" class:active={showKeys} onclick={() => (showKeys = !showKeys)} title="Keyboard map" aria-label="Keyboard map"><Icon name="keyboard" size={18} /></button>
      <button class="icon-btn" onclick={() => cube?.resetView()} title="Reset view" aria-label="Reset view"><Icon name="eye" size={18} /></button>
      <button class="icon-btn history-btn" onclick={() => (historyOpen = true)} title="History" aria-label="Solve history"><Icon name="list" size={18} /></button>
    </div>
    <div class="phone-stats num">
      <span><span class="k">best</span>{formatTime(stats.best, settings.precision)}</span>
      <span><span class="k">ao5</span>{formatTime(stats.ao5, settings.precision)}</span>
      <span><span class="k">ao12</span>{formatTime(stats.ao12, settings.precision)}</span>
      <span class="k">{stats.count} solves</span>
    </div>

    {#if scramble}
      <p class="scr mono">{scramble}</p>
    {/if}

    <div class="stage" bind:this={wrap} onpointerdown={pdown} onpointermove={pmove} onpointerup={pup} onpointercancel={pup} role="application" aria-label="Virtual cube">
      <div class="backdrop"></div>
      <div class="shadow"></div>
      <canvas bind:this={canvas}></canvas>
      {#if glError}
        <div class="glerr">WebGL2 isn't available in this browser, so the virtual cube can't be drawn.</div>
      {/if}
      {#if settings.vcMirrorHints && netSvg}
        <div class="net">{@html netSvg}</div>
      {/if}
    </div>

    <div class="hud" class:live={phase === 'solving'} class:insp={phase === 'inspect'}>
      <div class="time num">{display}</div>
      <div class="meta num">
        {#if replaying}
          replay · {replayPos}/{replayMoves.length} · <button class="link" onclick={stopReplay}>stop</button>
        {:else if phase === 'inspect'}inspection · first turn starts the timer
        {:else if phase === 'ready'}scrambled · first turn starts the timer
        {:else if phase === 'solving' || phase === 'done'}{moves} moves{tps ? ` · ${tps} TPS` : ''}
        {:else}free play · drag stickers to turn, drag the background to look around{/if}
      </div>
    </div>

    {#if showKeys}
      <div class="keys" data-no-timer>
        {#each keyRows as [code, mv]}
          <div><span class="kbd">{code.replace('Key', '').replace('Digit', '').replace('Semicolon', ';').replace('Period', '.').replace('Comma', ',').replace('Slash', '/')}</span><span class="mono">{mv}</span></div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<Modal bind:open={historyOpen} title="Virtual {size}x{size}" subtitle="{stats.count} solves" width={420}>
  <div class="recent in-modal">
    {#each recent as s (s.id)}
      <button class="rs num" onclick={() => { historyOpen = false; replaySolve = s; replayOpen = true; }}>
        <span class="t">{s.penalty < 0 ? 'DNF' : formatTime(s.time + s.penalty, settings.precision)}</span>
        <span class="m">{s.moves ?? '–'} mv</span>
        <span class="m">{s.moves ? (s.moves / (s.time / 1000)).toFixed(1) : '–'} tps</span>
      </button>
    {:else}
      <p class="muted empty">No virtual solves yet.</p>
    {/each}
  </div>
</Modal>

<Modal bind:open={replayOpen} title={replaySolve ? (replaySolve.penalty < 0 ? 'DNF' : formatTime(replaySolve.time + replaySolve.penalty, settings.precision)) : ''} subtitle={replaySolve ? `${replaySolve.moves ?? 0} moves · ${new Date(replaySolve.date).toLocaleString()}` : ''} width={560}>
  {#if replaySolve}
    <p class="label">Scramble</p>
    <p class="mono small">{replaySolve.scramble}</p>
    <p class="label">Solution</p>
    <p class="mono small">{replaySolve.recon?.split(' ').map((x) => x.split('@')[0]).join(' ') || '—'}</p>
  {/if}
  {#snippet footer()}
    <Segmented bind:value={replaySpeed} options={[{ value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }]} size="sm" />
    <span style="flex:1"></span>
    <button class="btn primary sm" onclick={() => replaySolve && startReplay(replaySolve)} disabled={!replaySolve?.recon}><Icon name="play" size={13} />Replay</button>
  {/snippet}
</Modal>

<style>
  .cube-page {
    height: 100%;
    display: grid;
    grid-template-columns: 272px 1fr;
    min-height: 0;
  }
  /* Floating panel, like the timer's session panel. */
  .side {
    margin: 0 0 var(--gap) var(--gap);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-xl);
    box-shadow: var(--hi), var(--shadow);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .vtitle {
    font-family: var(--display);
    font-size: 21px;
    line-height: 1;
    letter-spacing: -0.01em;
  }
  :global(:root[data-heading='sans']) .vtitle {
    font-family: var(--font);
    font-size: 14px;
    font-weight: 600;
  }
  .side-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 16px 10px;
    font-size: 12px;
  }
  .kpis {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 4px 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .kpis div {
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg-2);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .kpis span {
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 500;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--fg-3);
  }
  .kpis b {
    font-size: 17px;
    font-weight: 500;
  }
  .recent {
    flex: 1;
    overflow: auto;
    padding: 6px;
  }
  .rs {
    display: grid;
    grid-template-columns: 1fr 56px 60px;
    width: 100%;
    height: 32px;
    align-items: center;
    padding: 0 10px;
    border-radius: 8px;
    font-size: 13.5px;
    text-align: left;
  }
  .rs:hover {
    background: var(--bg-hover);
  }
  .rs .m {
    color: var(--fg-3);
    font-size: 12px;
    text-align: right;
  }
  .empty {
    padding: 16px 12px;
    font-size: 13px;
    line-height: 1.6;
  }
  .main {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
  }
  .spacer {
    flex: 1;
  }
  .k {
    font-family: var(--mono);
    font-size: 10.5px;
    opacity: 0.6;
    margin-left: 2px;
  }
  .scr {
    text-align: center;
    margin: 0 auto;
    max-width: 760px;
    padding: 0 16px;
    font-size: 14px;
    color: var(--fg-2);
    line-height: 1.6;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    touch-action: none;
    cursor: grab;
  }
  .stage:active {
    cursor: grabbing;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 46% 52% at 50% 46%, var(--bg-3), transparent 72%);
    pointer-events: none;
  }
  .shadow {
    position: absolute;
    left: 50%;
    bottom: 9%;
    width: 38%;
    height: 9%;
    transform: translateX(-50%);
    background: radial-gradient(closest-side, rgb(0 0 0 / 0.12), transparent);
    pointer-events: none;
  }
  :global([data-theme='dark']) .shadow {
    background: radial-gradient(closest-side, rgb(0 0 0 / 0.6), transparent);
  }
  .glerr {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--fg-3);
    padding: 24px;
    text-align: center;
  }
  .net {
    position: absolute;
    right: 16px;
    top: 8px;
    width: 170px;
    opacity: 0.95;
    pointer-events: none;
  }
  .net :global(svg) {
    width: 100%;
    height: auto;
  }
  .hud {
    position: absolute;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    text-align: center;
    pointer-events: none;
  }
  .time {
    font-size: 44px;
    font-weight: 300;
    letter-spacing: -0.04em;
    line-height: 1;
    color: var(--fg);
  }
  .hud.insp .time {
    color: var(--fg-2);
  }
  .meta {
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--fg-3);
  }
  .link {
    pointer-events: auto;
    text-decoration: underline;
    color: var(--fg-2);
  }
  .keys {
    position: absolute;
    left: 16px;
    top: 64px;
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: 4px 14px;
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: var(--shadow);
    font-size: 12px;
    z-index: 5;
  }
  .keys div {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .small {
    font-size: 13px;
    color: var(--fg-2);
    margin: 4px 0 14px;
    line-height: 1.6;
    user-select: text;
  }
  .history-btn,
  .phone-stats {
    display: none;
  }
  .recent.in-modal {
    max-height: 60vh;
    overflow: auto;
    margin: 0 -8px;
  }
  @media (max-width: 860px) {
    .cube-page {
      grid-template-columns: 1fr;
    }
    .side {
      display: none;
    }
    .k {
      display: none;
    }
    .toolbar {
      flex-wrap: wrap;
      row-gap: 8px;
    }
    .history-btn {
      display: inline-grid;
    }
    .phone-stats {
      display: flex;
      justify-content: center;
      gap: 16px;
      font-size: 12.5px;
      color: var(--fg-2);
      padding: 4px 12px 0;
    }
    .phone-stats .k {
      display: inline;
      color: var(--fg-3);
      margin-right: 4px;
    }
  }
</style>
