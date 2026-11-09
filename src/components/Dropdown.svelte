<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';

  let {
    open = $bindable(false),
    align = 'start',
    width = 0,
    up = false,
    trigger,
    children,
  }: {
    open?: boolean;
    align?: 'start' | 'end' | 'center';
    width?: number;
    up?: boolean;
    trigger: Snippet<[{ open: boolean; toggle: () => void }]>;
    children: Snippet<[{ close: () => void }]>;
  } = $props();

  let root: HTMLDivElement | undefined = $state();

  const toggle = () => (open = !open);
  const close = () => (open = false);

  function onpointerdown(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      open = false;
    }
  }
</script>

<svelte:window onpointerdowncapture={onpointerdown} onkeydowncapture={onkeydown} />

<div class="dd" bind:this={root}>
  {@render trigger({ open, toggle })}
  {#if open}
    <div
      class="panel {align}"
      class:up
      style={width ? `width:${width}px` : ''}
      transition:fly={{ y: up ? 4 : -4, duration: 130 }}
    >
      {@render children({ close })}
    </div>
  {/if}
</div>

<style>
  .dd {
    position: relative;
    display: inline-flex;
    max-width: 100%;
    min-width: 0;
  }
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 60;
    min-width: 200px;
    max-height: min(480px, 70vh);
    overflow: auto;
    background: var(--glass);
    -webkit-backdrop-filter: blur(20px) saturate(1.5);
    backdrop-filter: blur(20px) saturate(1.5);
    border: 1px solid var(--line-2);
    border-radius: 14px;
    box-shadow: var(--hi), var(--shadow-float);
    padding: 5px;
  }
  .panel.up {
    top: auto;
    bottom: calc(100% + 6px);
  }
  .panel.end {
    left: auto;
    right: 0;
  }
  .panel.center {
    left: 50%;
    transform: translateX(-50%);
  }
  :global(.menu-item) {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 32px;
    padding: 6px 10px;
    border-radius: 9px;
    text-align: left;
    font-size: 13px;
    color: var(--fg);
    white-space: nowrap;
  }
  :global(.menu-item:hover),
  :global(.menu-item.focused) {
    background: var(--bg-hover);
  }
  :global(.menu-item.selected) {
    font-weight: 600;
  }
  :global(.menu-item .hint) {
    margin-left: auto;
    color: var(--fg-3);
    font-size: 12px;
    padding-left: 16px;
  }
  :global(.menu-sep) {
    height: 1px;
    background: var(--line);
    margin: 5px 4px;
  }
  :global(.menu-head) {
    padding: 8px 10px 4px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-3);
  }
</style>
