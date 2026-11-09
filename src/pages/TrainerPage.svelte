<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { ui } from '../lib/store/ui.svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import CaseModal from './trainer/CaseModal.svelte';
  import TrainView from './trainer/TrainView.svelte';
  import RecognizeView from './trainer/RecognizeView.svelte';
  import { SETS, setById, type TCase, type SetId } from '../lib/trainer/sets';
  import { trainer, type Mode } from '../lib/trainer/trainer.svelte';
  import { caseSvg, faceColors } from '../lib/render/case-svg';
  import { settings } from '../lib/store/settings.svelte';
  import { router } from '../lib/router.svelte';
  import { formatTime } from '../lib/stats/format';

  let view = $state<'cases' | 'train' | 'recognize'>('cases');
  let focusedPractice = $state.raw<{ c: TCase; alg: string } | null>(null);
  let openCase = $state<TCase | null>(null);
  let modalOpen = $state(false);
  let filter = $state<'all' | 'new' | 'learning' | 'learned'>('all');
  let collapsed = $state<Record<string, boolean>>({});

  onMount(() => {
    void trainer.load();
  });
  // "Train PLL" from the command palette works even when this page is already open,
  // and the parameter is consumed so it doesn't override your choice on every reload.
  $effect(() => {
    const p = router.params.get('set');
    if (!p || !trainer.loaded) return;
    untrack(() => {
      if (SETS.some((s) => s.id === p)) pickSet(p as SetId);
      router.replace('train');
    });
  });

  const set = $derived(setById(trainer.data.set));
  const selected = $derived.by(() => {
    void trainer.data.selected[set.id];
    return trainer.selectedOf(set.id);
  });
  const colors = $derived(faceColors(settings.cubeColors, settings.trainerYellowTop));
  const big = $derived(set.cases.length > 100);

  const visible = (c: TCase) => filter === 'all' || trainer.status(c.id) === filter;
  const groups = $derived(set.groups.map((g) => ({ name: g, cases: set.cases.filter((c) => c.group === g) })));

  function pickSet(id: SetId) {
    trainer.data.set = id;
    trainer.save();
    collapsed = {};
    exitPractice();
  }
  // Acts on the cases you can see: with a status filter on, hidden cases are left alone.
  function toggleGroup(cases: TCase[]) {
    const vis = cases.filter(visible);
    const all = vis.every((c) => selected.has(c.id));
    const next = new Set(selected);
    for (const c of vis) all ? next.delete(c.id) : next.add(c.id);
    trainer.setSelected(set.id, next);
  }
  function selectWhere(pred: (c: TCase) => boolean, empty?: string) {
    const ids = set.cases.filter(pred).map((c) => c.id);
    if (!ids.length && empty) {
      ui.toast(empty);
      return;
    }
    trainer.setSelected(set.id, ids);
  }
  function start(mode: Mode) {
    focusedPractice = null;
    trainer.data.mode = mode;
    trainer.save();
    view = mode === 'recognize' ? 'recognize' : 'train';
  }
  function show(c: TCase) {
    openCase = c;
    modalOpen = true;
  }
  function practiceCase(c: TCase, alg: string) {
    modalOpen = false;
    focusedPractice = { c, alg };
    view = 'train';
  }
  function exitPractice() {
    focusedPractice = null;
    view = 'cases';
  }
  const isCollapsed = (g: string, i: number) => collapsed[g] ?? (big && i > 0);

  const selectedCases = $derived(set.cases.filter((c) => selected.has(c.id)));
  const learnedCount = $derived(set.cases.filter((c) => trainer.status(c.id) === 'learned').length);
  const methods = ['CFOP', 'ZB', 'Roux'] as const;
</script>

<div class="page">
  <div class="page-inner">
    {#if view === 'cases'}
      <span class="eyebrow">{SETS.length} sets · {SETS.reduce((a, x) => a + x.cases.length, 0).toLocaleString()} verified cases</span>
      <h1 class="page-title">Algorithm trainer</h1>
      <p class="page-sub">Open a case to learn its algorithm move by move in 3D, or select cases to drill with realistic scrambles.</p>

      <div class="sets">
        {#each methods as m}
          <div class="method">
            <span class="label">{m}</span>
            <div class="pills">
              {#each SETS.filter((s) => s.method === m) as s (s.id)}
                <button class="pill" class:on={s.id === set.id} onclick={() => pickSet(s.id)}>
                  {s.name}<span class="n num">{s.cases.length}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="intro">
        <div>
          <h2>{set.name}</h2>
          <p class="muted">{set.blurb}</p>
        </div>
        <div class="progress num">
          <div class="bar"><span style="width:{(learnedCount / set.cases.length) * 100}%"></span></div>
          <span>{learnedCount}/{set.cases.length} learned</span>
        </div>
      </div>

      <div class="toolbar">
        <div class="sel">
          <span class="num"><b>{selectedCases.length}</b> selected</span>
          <button class="btn sm ghost" onclick={() => selectWhere(() => true)}>All</button>
          <button class="btn sm ghost" onclick={() => selectWhere(() => false)}>None</button>
          <button class="btn sm ghost" onclick={() => selectWhere((c) => trainer.status(c.id) === 'learning', 'No cases are marked “learning” yet')}>Learning</button>
          <button class="btn sm ghost" onclick={() => selectWhere((c) => trainer.status(c.id) !== 'learned', 'Every case is learned. Nice.')}>Not learned</button>
        </div>
        <Segmented bind:value={filter} size="sm" options={[{ value: 'all', label: 'All' }, { value: 'new', label: 'New' }, { value: 'learning', label: 'Learning' }, { value: 'learned', label: 'Learned' }]} />
      </div>

      <div class="start">
        <button class="btn primary lg" disabled={!selectedCases.length} onclick={() => start('random')}><Icon name="play" size={14} />Train</button>
        <button class="btn lg" disabled={!selectedCases.length} onclick={() => start('weighted')} title="Slow and new cases come up more often">Weighted</button>
        <button class="btn lg" disabled={!selectedCases.length} onclick={() => start('recap')} title="Every selected case once">Recap</button>
        <button class="btn lg" disabled={selectedCases.length < 1} onclick={() => start('recognize')} title="Name the case from its picture">Recognition</button>
      </div>

      {#each groups as g, gi (g.name)}
        {@const vis = g.cases.filter(visible)}
        {#if vis.length}
          {@const allOn = g.cases.every((c) => selected.has(c.id))}
          {@const someOn = g.cases.some((c) => selected.has(c.id))}
          <section class="group">
            <div class="ghead">
              <button
                class="check"
                class:on={allOn}
                class:some={!allOn && someOn}
                onclick={() => toggleGroup(g.cases)}
                role="checkbox"
                aria-checked={allOn ? 'true' : someOn ? 'mixed' : 'false'}
                aria-label="Select all of {g.name}"
              >
                {#if allOn}<Icon name="check" size={12} stroke={2.4} />{:else if someOn}<span class="dash"></span>{/if}
              </button>
              <button class="gname" onclick={() => (collapsed[g.name] = !isCollapsed(g.name, gi))}>
                <h3>{g.name}</h3>
                <span class="muted num">{g.cases.filter((c) => selected.has(c.id)).length}/{g.cases.length}</span>
                <Icon name={isCollapsed(g.name, gi) ? 'right' : 'down'} size={14} />
              </button>
            </div>
            {#if !isCollapsed(g.name, gi)}
              <div class="grid">
                {#each vis as c (c.id)}
                  {@const st = trainer.status(c.id)}
                  <div class="card" class:on={selected.has(c.id)}>
                    <button class="hit" onclick={() => trainer.toggle(set.id, c.id)} aria-pressed={selected.has(c.id)} aria-label="Select {c.name}">
                      <div class="img">{@html caseSvg(c.state, set.view, colors, set.view === 'll-pll')}</div>
                      <div class="meta">
                        <span class="name">{c.name}</span>
                        <span class="t num">{formatTime(trainer.mean(c.id), 2)}</span>
                      </div>
                      <div class="alg mono">{trainer.mainAlg(c)}</div>
                    </button>
                    <button class="info icon-btn sm" onclick={() => show(c)} aria-label="Details for {c.name}" title="Case details and 3D lesson"><Icon name="more" size={15} /></button>
                    {#if st !== 'new'}<span class="st {st}" title={st}></span>{/if}
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {/if}
      {/each}
      {#if filter !== 'all' && !set.cases.some(visible)}
        <p class="muted none">No {filter} cases in {set.name}. <button class="link" onclick={() => (filter = 'all')}>Show all</button></p>
      {/if}
    {:else if view === 'train'}
      <TrainView
        {set}
        cases={focusedPractice ? [focusedPractice.c] : selectedCases}
        mode={focusedPractice ? 'random' : trainer.data.mode}
        practiceAlg={focusedPractice?.alg}
        onexit={exitPractice}
        onopen={show}
      />
    {:else}
      <RecognizeView {set} cases={selectedCases} onexit={() => (view = 'cases')} />
    {/if}
  </div>
</div>

<CaseModal bind:open={modalOpen} {set} c={openCase} onpractice={view === 'cases' ? practiceCase : undefined} />

<style>
  .sets {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 28px;
    margin-bottom: 30px;
  }
  .method {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 14px;
    border-radius: 11px;
    border: 1px solid var(--line);
    background: var(--bg);
    box-shadow: var(--hi), var(--shadow-sm);
    font-weight: 500;
    font-size: 13px;
    transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.14s var(--ease);
  }
  .pill:hover {
    border-color: var(--line-3);
  }
  .pill:active {
    transform: scale(0.97);
  }
  .pill.on {
    background-color: var(--accent);
    background-image: linear-gradient(180deg, rgb(255 255 255 / 0.12), rgb(255 255 255 / 0));
    color: var(--accent-fg);
    border-color: transparent;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.14), 0 1px 2px rgb(0 0 0 / 0.16), 0 4px 12px -6px color-mix(in srgb, var(--accent) 60%, transparent);
  }
  .pill .n {
    font-size: 11px;
    opacity: 0.55;
  }
  .intro {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
    margin-bottom: 18px;
    padding-top: 22px;
    border-top: 1px solid var(--line);
  }
  .intro h2 {
    margin: 0;
    font-family: var(--display);
    font-size: 32px;
    font-weight: 400;
    line-height: 1.05;
    letter-spacing: -0.01em;
  }
  :global(:root[data-heading='sans']) .intro h2 {
    font-size: 21px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .intro p {
    margin: 4px 0 0;
    max-width: 560px;
  }
  .progress {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    font-size: 12px;
    color: var(--fg-3);
    min-width: 160px;
  }
  .progress .bar {
    width: 160px;
    height: 4px;
    border-radius: 4px;
    background: var(--line);
    overflow: hidden;
  }
  .progress .bar span {
    display: block;
    height: 100%;
    background: var(--fg);
    transition: width 0.3s var(--ease);
  }
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .sel {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 13px;
  }
  .sel > span {
    margin-right: 10px;
    color: var(--fg-2);
  }
  .sel b {
    font-weight: 600;
    color: var(--fg);
  }
  .start {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0 26px;
  }
  .group {
    margin-bottom: 22px;
  }
  .ghead {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .check {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1.5px solid var(--line-3);
    display: grid;
    place-items: center;
    flex: none;
  }
  .check.on,
  .check.some {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }
  .dash {
    width: 8px;
    height: 2px;
    background: var(--bg);
    border-radius: 2px;
  }
  .gname {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--fg-3);
  }
  .gname h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--fg);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .card {
    position: relative;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: var(--hi), var(--shadow-sm);
    transition: border-color 0.15s, opacity 0.15s, transform 0.25s var(--glide), box-shadow 0.25s var(--ease);
    opacity: 0.6;
  }
  .card:hover {
    border-color: var(--line-3);
    opacity: 0.92;
    transform: translateY(-1px);
    box-shadow: var(--hi), var(--shadow);
  }
  .card.on {
    opacity: 1;
    border-color: var(--fg);
    box-shadow: var(--hi), 0 0 0 0.5px var(--fg), var(--shadow);
  }
  .hit {
    display: block;
    width: 100%;
    padding: 12px 12px 10px;
    text-align: left;
  }
  .img {
    width: 78%;
    margin: 0 auto 8px;
  }
  .img :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
  }
  .name {
    font-weight: 600;
    font-size: 13px;
  }
  .t {
    font-size: 12px;
    color: var(--fg-3);
  }
  .alg {
    font-size: 10.5px;
    color: var(--fg-3);
    margin-top: 3px;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .info {
    position: absolute;
    top: 6px;
    right: 6px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .card:hover .info,
  .info:focus-visible,
  .card:focus-within .info {
    opacity: 1;
  }
  .none {
    text-align: center;
    padding: 32px 0;
  }
  .none .link {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .st {
    position: absolute;
    top: 12px;
    left: 12px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1.5px solid var(--fg);
  }
  .st.learned {
    background: var(--fg);
  }
  @media (hover: none) {
    .info {
      opacity: 1;
    }
  }
  @media (max-width: 600px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
    }
    .intro {
      flex-direction: column;
      align-items: flex-start;
    }
    .progress {
      align-items: flex-start;
    }
  }
</style>
