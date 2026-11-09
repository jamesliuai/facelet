<script lang="ts">
  import { untrack } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import SessionPanel from './SessionPanel.svelte';
  import Icon from '../../components/Icon.svelte';
  import { ui } from '../../lib/store/ui.svelte';

  let phone = $state(typeof matchMedia !== 'undefined' && matchMedia('(max-width: 720px)').matches);
  $effect(() => {
    const mq = matchMedia('(max-width: 720px)');
    const on = () => (phone = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });
  // Opening the sheet on a wide screen is pointless once the panel is visible.
  $effect(() => {
    const mq = matchMedia('(min-width: 961px)');
    const on = () => mq.matches && (ui.sheetOpen = false);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  $effect(() => {
    if (!ui.sheetOpen) return;
    untrack(() => ui.modalDepth++);
    return () => untrack(() => ui.modalDepth--);
  });
  const close = () => (ui.sheetOpen = false);
</script>

<svelte:window onkeydown={(e) => ui.sheetOpen && e.key === 'Escape' && close()} />

{#if ui.sheetOpen}
  <div class="scrim" transition:fade={{ duration: 150 }} onpointerdown={close} role="presentation"></div>
  <div
    class="sheet"
    class:phone
    role="dialog"
    aria-modal="true"
    aria-label="Session"
    transition:fly={phone ? { y: 480, duration: 260, opacity: 1 } : { x: -340, duration: 220, opacity: 1 }}
    data-no-timer
  >
    {#if phone}
      <div class="grab">
        <span class="handle"></span>
        <button class="icon-btn sm close" onclick={close} aria-label="Close"><Icon name="x" size={16} /></button>
      </div>
    {/if}
    <SessionPanel />
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: var(--scrim);
  }
  .sheet {
    position: fixed;
    top: 10px;
    bottom: 10px;
    left: 10px;
    width: min(340px, 90vw);
    z-index: 91;
    background: var(--bg);
    border: 1px solid var(--line-2);
    border-radius: var(--r-xl);
    box-shadow: var(--hi), var(--shadow-lg);
    overflow: hidden;
    padding-bottom: env(safe-area-inset-bottom);
    display: flex;
    flex-direction: column;
  }
  .sheet.phone {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    height: min(82vh, 720px);
    border-width: 1px 0 0;
    border-radius: 24px 24px 0 0;
    overflow: hidden;
  }
  .sheet > :global(.panel) {
    flex: 1;
    min-height: 0;
  }
  .grab {
    position: relative;
    height: 22px;
    flex: none;
    display: grid;
    place-items: center;
  }
  .handle {
    width: 36px;
    height: 4px;
    border-radius: 4px;
    background: var(--line-3);
  }
  .close {
    position: absolute;
    right: 8px;
    top: 4px;
  }
</style>
