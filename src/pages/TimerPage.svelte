<script lang="ts">
  import SessionPanel from './timer/SessionPanel.svelte';
  import ScrambleBar from './timer/ScrambleBar.svelte';
  import Clock from './timer/Clock.svelte';
  import Dock from './timer/Dock.svelte';
  import MobileStats from './timer/MobileStats.svelte';
  import { timer } from '../lib/timer/timer.svelte';
  import { sessions } from '../lib/store/sessions.svelte';
  import { settings } from '../lib/store/settings.svelte';
  import { ui, typingInField } from '../lib/store/ui.svelte';
  import { unlockAudio } from '../lib/timer/audio';
  import { keepAwake, toggleFullscreen } from '../lib/device';
  import { setLastPenalty, deleteLast, copyText } from '../lib/commands';

  let scrambleBar: ScrambleBar | undefined = $state();

  $effect(() => {
    void sessions.current?.id;
    void sessions.current?.scrambleType;
    timer.sync();
  });

  // Keep the screen on while practising: from the first press until a few idle minutes later.
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const active = timer.phase !== 'idle';
    void sessions.solves.length;
    if (!settings.keepAwake) {
      keepAwake(false);
      return;
    }
    clearTimeout(sleepTimer);
    keepAwake(true);
    if (!active) sleepTimer = setTimeout(() => keepAwake(false), 4 * 60_000);
  });
  $effect(() => () => {
    clearTimeout(sleepTimer);
    keepAwake(false);
  });

  function shortcut(e: KeyboardEvent): boolean {
    const code = e.code;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && code === 'KeyZ' && !e.shiftKey) {
      void sessions.undoDelete().then((n) => n && ui.toast(n === 1 ? 'Solve restored' : `${n} solves restored`));
      return true;
    }
    if (!e.altKey || e.metaKey || e.ctrlKey) return false;
    switch (code) {
      case 'Digit1': void setLastPenalty(0); return true;
      case 'Digit2': void setLastPenalty(2000); return true;
      case 'Digit3': void setLastPenalty(-1); return true;
      case 'Backspace':
      case 'Delete': void deleteLast(); return true;
      case 'ArrowRight': timer.nextScrambleOrNew(); return true;
      case 'ArrowLeft': timer.prevScramble(); return true;
      case 'KeyC': void copyText(timer.scramble, 'Scramble copied'); return true;
      case 'KeyE': scrambleBar?.edit(); return true;
      case 'KeyI': settings.inspection = !settings.inspection; ui.toast(settings.inspection ? 'Inspection on' : 'Inspection off'); return true;
      case 'KeyT': settings.inputMode = settings.inputMode === 'typing' ? 'timer' : 'typing'; return true;
      case 'KeyS': settings.showSidebar = !settings.showSidebar; return true;
      case 'KeyF': void toggleFullscreen(); return true;
    }
    return false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (ui.modalDepth > 0 || ui.paletteOpen || typingInField(e)) return;
    const p = timer.engine.phase;
    if (e.key === 'Escape') {
      if (p !== 'idle') {
        e.preventDefault();
        timer.cancel();
      }
      return;
    }
    if (p === 'idle' && (e.altKey || e.metaKey || e.ctrlKey)) {
      if (shortcut(e)) e.preventDefault();
      return;
    }
    if (settings.inputMode === 'typing') return;
    if (e.repeat) {
      if (e.code === 'Space') e.preventDefault();
      return;
    }
    const isSpace = e.code === 'Space';
    if (p === 'running') {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      timer.press(e.timeStamp || performance.now(), isSpace);
      return;
    }
    if (isSpace) {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      unlockAudio();
      timer.press(e.timeStamp || performance.now(), true);
    }
  }

  function onkeyup(e: KeyboardEvent) {
    if (settings.inputMode === 'typing' || ui.modalDepth > 0) return;
    const p = timer.engine.phase;
    if (p === 'idle') return;
    if (e.code === 'Space' || p === 'stopped') {
      e.preventDefault();
      timer.release(e.timeStamp || performance.now());
    }
  }

  // Alt-tabbing away mid-hold means the keyup never arrives: don't leave the timer armed.
  function onblur() {
    const p = timer.engine.phase;
    if (p === 'holding' || p === 'ready' || p === 'armInspect' || p === 'stopped') timer.abortHold();
  }

  // Touch timing anywhere on the stage, except on controls.
  function interactive(t: EventTarget | null) {
    return !!(t as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [data-no-timer], .dd');
  }
  function onpointerdown(e: PointerEvent) {
    if (e.pointerType === 'mouse' || settings.inputMode === 'typing' || ui.modalDepth > 0) return;
    const p = timer.engine.phase;
    if (p !== 'running' && interactive(e.target)) return;
    e.preventDefault();
    unlockAudio();
    timer.press(e.timeStamp || performance.now(), true);
  }
  function onpointerup(e: PointerEvent) {
    if (e.pointerType === 'mouse' || settings.inputMode === 'typing') return;
    if (timer.engine.phase === 'idle') return;
    timer.release(e.timeStamp || performance.now());
  }
  function onpointercancel() {
    const p = timer.engine.phase;
    if (p === 'holding' || p === 'ready' || p === 'armInspect') timer.abortHold();
  }

  const hide = $derived(ui.timing && settings.focusMode);
</script>

<svelte:window {onkeydown} {onkeyup} {onblur} />

<div class="tp" class:nosb={!settings.showSidebar} class:right={settings.sidebarSide === 'right'} class:hide>
  <aside class="sb" aria-label="Session">
    <SessionPanel />
  </aside>
  <section class="stage" {onpointerdown} {onpointerup} {onpointercancel} role="application" aria-label="Timer">
    <div class="fade top"><ScrambleBar bind:this={scrambleBar} /></div>
    <div class="center"><Clock /></div>
    {#if settings.showDock}<div class="fade dock"><Dock /></div>{/if}
    <div class="fade mstats"><MobileStats /></div>
  </section>
</div>

<style>
  .tp {
    height: 100%;
    display: grid;
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
    grid-template-areas: 'side stage';
    min-height: 0;
  }
  .tp.right {
    grid-template-columns: minmax(0, 1fr) var(--sidebar-w);
    grid-template-areas: 'stage side';
  }
  .tp.nosb,
  .tp.nosb.right {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'stage';
  }
  /* The session panel floats on the canvas. */
  .sb {
    grid-area: side;
    min-height: 0;
    overflow: hidden;
    margin: 0 0 var(--gap) var(--gap);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-xl);
    box-shadow: var(--hi), var(--shadow);
    transition: opacity 0.35s var(--ease), transform 0.5s var(--glide), filter 0.35s var(--ease);
  }
  .right .sb {
    margin: 0 var(--gap) var(--gap) 0;
  }
  .nosb .sb {
    display: none;
  }
  .stage {
    grid-area: stage;
    position: relative;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .center {
    min-height: 0;
    display: grid;
    place-items: center;
    padding: 0 24px 76px;
    container-type: inline-size;
  }
  .fade {
    transition: opacity 0.35s var(--ease), transform 0.5s var(--glide), filter 0.35s var(--ease);
  }
  /* Solving: everything but the time recedes. */
  .hide .fade,
  .hide .sb {
    opacity: 0;
    filter: blur(4px);
    pointer-events: none;
  }
  .hide .sb {
    transform: translateX(-14px) scale(0.985);
  }
  .hide.right .sb {
    transform: translateX(14px) scale(0.985);
  }
  .hide .top {
    transform: translateY(-8px);
  }
  .hide .dock,
  .hide .mstats {
    transform: translateY(10px);
  }
  .dock {
    position: absolute;
    right: 20px;
    bottom: 20px;
  }
  .right .dock {
    right: auto;
    left: 20px;
  }
  .mstats {
    display: none;
  }
  @media (max-width: 960px) {
    .tp,
    .tp.right,
    .tp.nosb {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'stage';
    }
    .sb {
      display: none;
    }
  }
  @media (max-width: 720px) {
    .dock {
      display: none;
    }
    .center {
      padding: 0 12px 84px;
    }
    .mstats {
      display: block;
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 12px;
    }
  }
</style>
