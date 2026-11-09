<script lang="ts">
  import { untrack } from 'svelte';
  import { quintOut } from 'svelte/easing';
  import { fly, fade } from 'svelte/transition';
  import AppearanceControls from './AppearanceControls.svelte';
  import Icon from './Icon.svelte';
  import { ui } from '../lib/store/ui.svelte';
  import { resetSettings, APPEARANCE_KEYS } from '../lib/store/settings.svelte';
  import { router } from '../lib/router.svelte';

  let panel: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!ui.customizeOpen) return;
    untrack(() => ui.modalDepth++);
    const prev = document.activeElement as HTMLElement | null;
    queueMicrotask(() => panel?.focus());
    return () => {
      untrack(() => ui.modalDepth--);
      prev?.focus?.();
    };
  });

  const close = () => (ui.customizeOpen = false);

  function onkeydown(e: KeyboardEvent) {
    if (ui.customizeOpen && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
</script>

<svelte:window onkeydowncapture={onkeydown} />

{#if ui.customizeOpen}
  <!-- A clear scrim: the page stays fully visible so changes can be judged live. -->
  <div class="scrim" transition:fade={{ duration: 120 }} onpointerdown={close} role="presentation"></div>
  <div class="drawer" role="dialog" aria-modal="true" aria-label="Customize" tabindex="-1" bind:this={panel} transition:fly={{ x: 400, duration: 380, opacity: 1, easing: quintOut }}>
    <header>
      <div>
        <h2>Customize</h2>
        <p>Changes apply instantly.</p>
      </div>
      <button class="icon-btn" onclick={close} aria-label="Close"><Icon name="x" /></button>
    </header>
    <div class="body">
      <AppearanceControls dark={ui.dark} />
    </div>
    <footer>
      <button class="btn ghost sm" onclick={() => resetSettings(APPEARANCE_KEYS)}><Icon name="undo" size={14} />Reset</button>
      <button
        class="btn sm"
        onclick={() => {
          close();
          router.go('settings');
        }}>All settings<Icon name="right" size={14} /></button
      >
    </footer>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 110;
    background: transparent;
  }
  .drawer {
    position: fixed;
    top: 10px;
    right: 10px;
    bottom: 10px;
    z-index: 111;
    width: min(380px, calc(100vw - 20px));
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--line-2);
    border-radius: var(--r-xl);
    box-shadow: var(--hi), var(--shadow-lg);
    outline: none;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 18px 14px 10px 20px;
  }
  h2 {
    margin: 0;
    font-family: var(--display);
    font-size: 26px;
    font-weight: 400;
    line-height: 1.1;
    letter-spacing: -0.01em;
  }
  :global(:root[data-heading='sans']) h2 {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.015em;
  }
  header p {
    margin: 2px 0 0;
    font-size: 12.5px;
    color: var(--fg-3);
  }
  .body {
    flex: 1;
    overflow: auto;
    padding: 8px 20px 24px;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
    background: var(--bg-2);
  }
  @media (max-width: 720px) {
    .drawer {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      height: min(78vh, 680px);
      border-radius: 20px 20px 0 0;
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
