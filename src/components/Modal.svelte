<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { ui } from '../lib/store/ui.svelte';
  import Icon from './Icon.svelte';

  let {
    open = $bindable(false),
    title = '',
    subtitle = '',
    width = 520,
    onclose,
    children,
    footer,
  }: {
    open?: boolean;
    title?: string;
    subtitle?: string;
    width?: number;
    onclose?: () => void;
    children?: Snippet;
    footer?: Snippet;
  } = $props();

  let panel: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!open) return;
    untrack(() => ui.modalDepth++);
    const prev = document.activeElement as HTMLElement | null;
    queueMicrotask(() => {
      // Only an explicit [autofocus] gets focus; otherwise the dialog itself, so a stray
      // Space or Enter can't press whatever button happens to come first.
      const f = panel?.querySelector<HTMLElement>('[autofocus]');
      (f ?? panel)?.focus();
    });
    return () => {
      untrack(() => ui.modalDepth--);
      prev?.focus?.();
    };
  });

  function close() {
    open = false;
    onclose?.();
  }

  function onkeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
</script>

<svelte:window onkeydowncapture={onkeydown} />

{#if open}
  <div class="backdrop" transition:fade={{ duration: 140 }} onpointerdown={(e) => e.target === e.currentTarget && close()} role="presentation">
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      bind:this={panel}
      style="width: min({width}px, calc(100vw - 24px))"
      in:scale={{ start: 0.96, duration: 260, opacity: 0, easing: backOut }}
      out:scale={{ start: 0.98, duration: 140, opacity: 0 }}
    >
      {#if title}
        <header>
          <div>
            <h2>{title}</h2>
            {#if subtitle}<p>{subtitle}</p>{/if}
          </div>
          <button class="icon-btn close" onclick={close} aria-label="Close"><Icon name="x" /></button>
        </header>
      {/if}
      <div class="body">{@render children?.()}</div>
      {#if footer}<footer>{@render footer()}</footer>{/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: var(--scrim);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: grid;
    place-items: center;
    padding: 12px;
  }
  .modal {
    background: var(--bg);
    border: 1px solid var(--line-2);
    border-radius: var(--r-xl);
    box-shadow: var(--hi), var(--shadow-lg);
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    outline: none;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 22px 20px 4px 24px;
  }
  h2 {
    margin: 0;
    font-family: var(--display);
    font-size: 25px;
    font-weight: 400;
    line-height: 1.15;
    letter-spacing: -0.01em;
  }
  :global(:root[data-heading='sans']) h2 {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.015em;
  }
  header p {
    margin: 3px 0 0;
    color: var(--fg-3);
    font-size: 13px;
  }
  .body {
    padding: 14px 24px 22px;
    overflow: auto;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--line);
    background: var(--bg-2);
  }
</style>
