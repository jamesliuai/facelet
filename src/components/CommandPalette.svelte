<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { ui } from '../lib/store/ui.svelte';
  import { commands, fuzzy, type Command } from '../lib/commands';
  import Icon from './Icon.svelte';

  let query = $state('');
  let active = $state(0);
  let list: HTMLDivElement | undefined = $state();
  let all: Command[] = $state([]);

  $effect(() => {
    if (!ui.paletteOpen) return;
    untrack(() => {
      all = commands();
      query = '';
      active = 0;
      ui.modalDepth++;
    });
    return () => untrack(() => ui.modalDepth--);
  });

  const results = $derived.by(() => {
    if (!query.trim()) return all.filter((c) => c.group !== 'Open session' || all.filter((x) => x.group === 'Open session').indexOf(c) < 6);
    return all
      .map((c) => ({ c, s: Math.max(fuzzy(query, c.title), fuzzy(query, c.group + ' ' + c.title) - 30, c.keywords ? fuzzy(query, c.keywords) - 40 : -1) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.c);
  });

  $effect(() => {
    void query;
    active = 0;
  });

  function run(c: Command) {
    ui.paletteOpen = false;
    void c.run();
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      ui.paletteOpen = !ui.paletteOpen;
      return;
    }
    if (!ui.paletteOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      ui.paletteOpen = false;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(results.length - 1, active + 1);
      scrollIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
      scrollIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = results[active];
      if (c) run(c);
    }
  }

  function scrollIntoView() {
    queueMicrotask(() => list?.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' }));
  }
</script>

<svelte:window onkeydowncapture={onkeydown} />

{#if ui.paletteOpen}
  <div class="backdrop" transition:fade={{ duration: 120 }} onpointerdown={(e) => e.target === e.currentTarget && (ui.paletteOpen = false)} role="presentation">
    <div class="palette" role="dialog" aria-label="Command palette" transition:scale={{ start: 0.98, duration: 140, opacity: 0 }}>
      <div class="field">
        <Icon name="search" size={17} />
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={query} placeholder="Search commands, events, sessions…" autofocus spellcheck="false" />
        <span class="kbd">esc</span>
      </div>
      <div class="list" bind:this={list}>
        {#each results as c, i (c.id)}
          {#if i === 0 || results[i - 1].group !== c.group}
            <div class="group">{c.group}</div>
          {/if}
          <button class="item" class:active={i === active} onpointermove={() => (active = i)} onclick={() => run(c)}>
            <span>{c.title}</span>
            {#if c.hint}<span class="hint">{c.hint}</span>{/if}
          </button>
        {:else}
          <div class="empty">No results for “{query}”</div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    background: var(--scrim);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 12vh 12px 12px;
  }
  .palette {
    width: min(620px, 100%);
    background: var(--bg);
    border: 1px solid var(--line-2);
    border-radius: var(--r-xl);
    box-shadow: var(--hi), var(--shadow-lg);
    overflow: hidden;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 56px;
    border-bottom: 1px solid var(--line);
    color: var(--fg-3);
  }
  input {
    flex: 1;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 15px;
    color: var(--fg);
  }
  input::placeholder {
    color: var(--fg-4);
  }
  .list {
    max-height: min(420px, 60vh);
    overflow: auto;
    padding: 6px;
  }
  .group {
    padding: 10px 10px 4px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-3);
  }
  .item {
    display: flex;
    align-items: center;
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border-radius: 9px;
    text-align: left;
    font-size: 14px;
  }
  .item.active {
    background: var(--bg-hover);
  }
  .hint {
    margin-left: auto;
    font-size: 12px;
    color: var(--fg-3);
    font-family: var(--mono);
  }
  .empty {
    padding: 28px;
    text-align: center;
    color: var(--fg-3);
  }
</style>
