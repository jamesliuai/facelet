<script lang="ts" module>
  export interface LessonAlgorithm {
    full: string;
    source?: { name: string; url: string };
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import { parseAlg, resolve, tokenToString, type Token } from '../../lib/cube/alg';
  import { StickerCube } from '../../lib/cube/nxn';
  import { nxnStateSvg } from '../../lib/render/scramble-svg';
  import { VirtualCube } from '../../lib/vcube/controller';
  import { ui, typingInField } from '../../lib/store/ui.svelte';
  import { prefersReducedMotion } from '../../lib/store/settings.svelte';

  let { start, colors, algorithms, onback, onpractice }: {
    start: Uint8Array;
    colors: string[];
    algorithms: LessonAlgorithm[];
    onback: () => void;
    onpractice: (alg: string) => void;
  } = $props();

  let stage: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let backButton: HTMLButtonElement;
  let cube: VirtualCube | undefined;
  let autoplay: ReturnType<typeof setTimeout> | undefined;
  let has3d = $state(false);
  let position = $state(0);
  let playing = $state(false);
  let selected = $state<string | null>(null);
  const active = $derived(algorithms.find((a) => a.full === selected) ?? algorithms[0]);
  const steps = $derived.by(() => {
    try {
      return parseAlg(active?.full ?? '').flatMap((token) => {
        const move = resolve(token, 3);
        return move ? [{ token, move, label: tokenToString(token) }] : [];
      });
    } catch {
      return [];
    }
  });
  const next = $derived(steps[position]);

  const faces: Record<string, string> = { R: 'right', L: 'left', U: 'top', D: 'bottom', F: 'front', B: 'back' };
  const rotationFace: Record<string, string> = { X: 'right', Y: 'top', Z: 'front' };
  const sliceFace: Record<string, string> = { M: 'left', E: 'bottom', S: 'front' };

  function describeMove(t: Token): string {
    const turn = Math.abs(t.amount) % 4 === 2 ? '180°' : ((t.amount % 4) + 4) % 4 === 1 ? 'clockwise' : 'counterclockwise';
    if (t.kind === 'rot') return `Rotate the whole cube ${turn} as viewed from the ${rotationFace[t.base]}.`;
    if (t.kind === 'mid') return `Turn the ${t.base} slice ${turn} as viewed from the ${sliceFace[t.base]}.`;
    const face = faces[t.base];
    if (t.kind === 'wide') return `Turn the ${Math.min(t.depth, 3)} layers on the ${face} ${turn} as viewed from that side.`;
    if (t.kind === 'slice') return `Turn layer ${t.depth} ${turn}, counting from the ${face} and looking at that side.`;
    return `Turn the ${face} face ${turn} as viewed from that side.`;
  }

  function syncCube() {
    if (!cube || !has3d) return;
    cube.setFacelets(start);
    if (position > 0) cube.applyInstant(steps.slice(0, position).map((s) => s.label).join(' '));
  }

  function stop() {
    clearTimeout(autoplay);
    autoplay = undefined;
    playing = false;
  }

  function jump(target: number) {
    stop();
    position = target;
    syncCube();
  }

  function settled() {
    if (!playing) return;
    if (position === steps.length) {
      stop();
      return;
    }
    autoplay = setTimeout(() => {
      autoplay = undefined;
      advance(1);
    }, 240);
  }

  function advance(direction: -1 | 1) {
    const entry = steps[direction === 1 ? position : position - 1];
    if (!entry) return;
    position += direction;
    if (cube && has3d) {
      const move = entry.move;
      cube.turn(direction === 1 ? move : { ...move, q: (4 - move.q) as 1 | 2 | 3 }, false);
    } else {
      settled();
    }
  }

  function step(direction: -1 | 1) {
    stop();
    advance(direction);
  }

  function play() {
    if (playing) return stop();
    if (position === steps.length) jump(0);
    playing = true;
    advance(1);
  }

  function choose(event: Event) {
    selected = (event.currentTarget as HTMLSelectElement).value;
    jump(0);
  }

  function onkeydown(event: KeyboardEvent) {
    if (ui.paletteOpen || typingInField(event) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    if (!event.repeat) step(event.key === 'ArrowLeft' ? -1 : 1);
  }

  function orbitStart(event: PointerEvent) {
    if (!has3d || !event.isPrimary || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    cube?.pointerDown(event.clientX, event.clientY, true);
  }

  function orbitMove(event: PointerEvent) {
    if (canvas.hasPointerCapture(event.pointerId)) cube?.pointerMove(event.clientX, event.clientY);
  }

  onMount(() => {
    backButton.focus();
    try {
      cube = new VirtualCube(canvas);
    } catch {
      return stop;
    }
    has3d = true;
    cube.onTurnSettled = settled;
    syncCube();

    const resize = new ResizeObserver(([entry]) => cube?.resize(entry.contentRect.width, entry.contentRect.height));
    resize.observe(stage);
    canvas.addEventListener('webglcontextlost', oncontextlost);
    canvas.addEventListener('webglcontextrestored', oncontextrestored);
    return () => {
      stop();
      resize.disconnect();
      canvas.removeEventListener('webglcontextlost', oncontextlost);
      canvas.removeEventListener('webglcontextrestored', oncontextrestored);
      cube?.dispose();
      cube = undefined;
    };
  });

  function oncontextlost(event: Event) {
    event.preventDefault();
    stop();
    has3d = false;
  }

  function oncontextrestored() {
    if (!cube) return;
    try {
      cube.restore();
      has3d = true;
      syncCube();
    } catch {
      has3d = false;
    }
  }

  $effect(() => {
    const dark = ui.dark;
    const motion = prefersReducedMotion();
    const palette = colors;
    if (cube && has3d) {
      cube.turnMs = motion ? 0 : 330;
      cube.renderer.dark = dark;
      cube.setColors(palette);
    }
  });

  const fallback = $derived.by(() => {
    if (has3d) return '';
    const model = new StickerCube(3, start);
    for (const { move } of steps.slice(0, position)) model.move(move);
    return nxnStateSvg(model, colors);
  });
</script>

<svelte:window {onkeydown} />

<button class="btn sm ghost back" bind:this={backButton} onclick={onback}><Icon name="left" size={14} />Case details</button>

<div class="lesson">
  <div class="viewer">
    <div class="stage" bind:this={stage}>
      <canvas
        bind:this={canvas}
        class:hidden={!has3d}
        aria-label="Animated algorithm cube. Drag to change the viewing angle."
        onpointerdown={orbitStart}
        onpointermove={orbitMove}
        onlostpointercapture={() => cube?.pointerUp()}
      ></canvas>
      {#if has3d}
        <span class="viewer-hint">Drag to orbit</span>
        <button class="icon-btn sm reset-view" aria-label="Reset viewing angle" title="Reset viewing angle" onclick={() => cube?.resetView()}><Icon name="expand" size={15} /></button>
      {:else}
        <div class="net" aria-label="Cube state at step {position}">{@html fallback}</div>
        <span class="viewer-hint">2D cube view</span>
      {/if}
    </div>
    <div class="transport" aria-label="Playback controls">
      <button class="icon-btn" onclick={() => jump(0)} disabled={!position} aria-label="Restart" title="Restart"><Icon name="refresh" size={16} /></button>
      <button class="icon-btn" onclick={() => step(-1)} disabled={!position} aria-label="Previous move" title="Previous move (←)"><Icon name="left" size={18} /></button>
      <button class="btn primary play" onclick={play} disabled={!steps.length}><Icon name={playing ? 'pause' : 'play'} size={15} />{playing ? 'Pause' : 'Play'}</button>
      <button class="icon-btn" onclick={() => step(1)} disabled={position === steps.length} aria-label="Next move" title="Next move (→)"><Icon name="right" size={18} /></button>
    </div>
  </div>

  <div class="instruction">
    <div class="algorithm">
      <label class="label" for="lesson-algorithm">Algorithm</label>
      <select id="lesson-algorithm" class="input" value={active?.full} onchange={choose}>
        {#each algorithms as alg, i (alg.full)}
          <option value={alg.full}>{i === 0 ? 'Main algorithm' : `Alternative ${i}`}</option>
        {/each}
      </select>
      {#if active?.source}
        <a class="source" href={active.source.url} target="_blank" rel="noopener noreferrer">{active.source.name}</a>
      {/if}
    </div>

    <div class="steps" aria-label="Algorithm moves">
      {#each steps as move, i (i)}
        <button
          class="move mono"
          class:done={i < position}
          class:next={i === position}
          aria-current={i === position - 1 ? 'step' : undefined}
          aria-label="Go to step {i + 1}: {move.label}"
          onclick={() => jump(i + 1)}
        >{move.label}</button>
      {/each}
    </div>

    <div class="cue">
      <span class="label num" role="status">Step {position} of {steps.length}</span>
      {#if next}
        <p><strong class="mono">{next.label}</strong> {describeMove(next.token)}</p>
      {:else if steps.length}
        <p>Sequence complete.</p>
      {:else}
        <p>No playable moves for this algorithm.</p>
      {/if}
    </div>

    <button class="btn practice" onclick={() => onpractice(active.full)} disabled={!steps.length}>
      <Icon name="timer" size={15} />Practice this case
    </button>
  </div>
</div>

<style>
  .back {
    margin-bottom: 14px;
  }
  .lesson {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    align-items: start;
    gap: 24px;
  }
  .stage {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 4 / 3;
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 46%, var(--bg-3), var(--bg));
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: grab;
  }
  canvas:active {
    cursor: grabbing;
  }
  canvas.hidden {
    visibility: hidden;
  }
  .viewer-hint {
    position: absolute;
    bottom: 10px;
    left: 12px;
    color: var(--fg-2);
    font-size: 11px;
    pointer-events: none;
  }
  .reset-view {
    position: absolute;
    right: 8px;
    bottom: 6px;
  }
  .net {
    width: min(80%, 260px);
  }
  .net :global(svg) {
    display: block;
    width: 100%;
  }
  .transport {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  .play {
    min-width: 94px;
    justify-content: center;
  }
  .instruction, .algorithm {
    display: grid;
    gap: 10px;
  }
  .instruction {
    gap: 16px;
  }
  .algorithm {
    gap: 5px;
  }
  .source {
    width: fit-content;
    color: var(--fg-2);
    font-size: 12px;
    text-decoration: underline;
  }
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .move {
    min-width: 32px;
    padding: 5px 7px;
    border: 1px solid var(--line);
    border-radius: 7px;
    font-size: 13px;
  }
  .move.done {
    color: var(--fg-3);
    background: var(--bg-2);
  }
  .move.next {
    border-color: var(--accent);
    font-weight: 650;
  }
  .move:hover {
    background: var(--bg-hover);
  }
  .cue {
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .cue p {
    min-height: 2.6em;
    margin: 5px 0 0;
    color: var(--fg-2);
    font-size: 13px;
    line-height: 1.4;
  }
  .cue strong {
    color: var(--fg);
  }
  .practice {
    justify-self: start;
  }
  @media (max-width: 660px) {
    .lesson {
      grid-template-columns: minmax(0, 1fr);
      gap: 18px;
    }
    .stage {
      aspect-ratio: 3 / 2;
      max-height: 270px;
    }
  }
</style>
