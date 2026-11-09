<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import * as C from '../../lib/cube/cubie';
  import { caseState, type TCase, type TSet } from '../../lib/trainer/sets';
  import { caseSvg, faceColors } from '../../lib/render/case-svg';
  import { settings } from '../../lib/store/settings.svelte';
  import { ui, typingInField } from '../../lib/store/ui.svelte';
  import { randInt, shuffle } from '../../lib/rand';

  let { set, cases, onexit }: { set: TSet; cases: TCase[]; onexit: () => void } = $props();

  let current = $state<TCase | null>(null);
  let shownState = $state<C.Cubie | null>(null);
  let options = $state<TCase[]>([]);
  let answer = $state<string | null>(null);
  let correct = $state(0);
  let total = $state(0);
  let streak = $state(0);
  let started = 0;
  let lastMs = $state(0);

  const colors = $derived(faceColors(settings.cubeColors, settings.trainerYellowTop));

  function next() {
    let c: TCase;
    do c = cases[randInt(cases.length)];
    while (cases.length > 1 && c.id === current?.id);
    current = c;
    // view the case from a random angle
    const s = caseState(c.algs[0]);
    shownState = set.view === 'f2l' ? s : C.multiply(s, C.applyMoves(C.solved(), Array(randInt(4)).fill(0)));
    const pool = set.cases.filter((x) => x.id !== c.id);
    const sameGroup = shuffle(pool.filter((x) => x.group === c.group));
    const others = shuffle(pool.filter((x) => x.group !== c.group));
    options = shuffle([c, ...[...sameGroup, ...others].slice(0, 3)]);
    answer = null;
    started = performance.now();
  }

  function choose(o: TCase) {
    if (answer || !current) return;
    answer = o.id;
    total++;
    lastMs = performance.now() - started;
    if (o.id === current.id) {
      correct++;
      streak++;
    } else streak = 0;
  }

  onMount(next);

  function onkeydown(e: KeyboardEvent) {
    if (ui.modalDepth > 0 || typingInField(e)) return;
    if (e.key === 'Escape') return onexit();
    const n = parseInt(e.key, 10);
    if (!answer && n >= 1 && n <= options.length) {
      e.preventDefault();
      choose(options[n - 1]);
    } else if (answer && (e.key === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      next();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="rec">
  <div class="bar">
    <button class="btn sm ghost" onclick={onexit}><Icon name="left" size={15} />Cases</button>
    <span class="chip">{set.name} · Recognition</span>
    <span class="grow"></span>
    <span class="muted num">{correct}/{total} correct · streak {streak}</span>
  </div>
  {#if current && shownState}
    <div class="img">{@html caseSvg(shownState, set.view, colors, false)}</div>
    <p class="q">Which case is this?</p>
    <div class="opts">
      {#each options as o, i (o.id)}
        <button
          class="opt"
          class:right={answer && o.id === current.id}
          class:wrong={answer === o.id && o.id !== current.id}
          onclick={() => choose(o)}
        >
          <span class="kbd">{i + 1}</span>
          <span>{o.name}</span>
        </button>
      {/each}
    </div>
    <div class="after" class:show={!!answer}>
      {#if answer}
        <p class="num">{answer === current.id ? 'Correct' : `It's ${current.name}`} · {(lastMs / 1000).toFixed(2)} s</p>
        <button class="btn primary sm" onclick={next}>Next <span class="k">Enter</span></button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .rec {
    display: flex;
    flex-direction: column;
    align-items: center;
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
  .img {
    width: 210px;
  }
  .img :global(svg) {
    width: 100%;
    height: auto;
  }
  .q {
    color: var(--fg-3);
    margin: 20px 0 12px;
  }
  .opts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
    gap: 8px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 14px;
    border: 1px solid var(--line-2);
    border-radius: 12px;
    font-weight: 500;
    transition: all 0.15s;
  }
  .opt:hover {
    border-color: var(--line-3);
    background: var(--bg-2);
  }
  .opt.right {
    background: var(--inv-bg);
    color: var(--inv-fg);
    border-color: var(--inv-bg);
  }
  .opt.right .kbd {
    background: transparent;
    color: var(--inv-fg);
    border-color: color-mix(in srgb, var(--inv-fg) 40%, transparent);
  }
  .opt.wrong {
    text-decoration: line-through;
    color: var(--fg-3);
  }
  .after {
    margin-top: 18px;
    min-height: 70px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .after.show {
    opacity: 1;
  }
  .after p {
    margin: 0;
    color: var(--fg-2);
  }
  .k {
    font-family: var(--mono);
    font-size: 10.5px;
    opacity: 0.6;
  }
</style>
