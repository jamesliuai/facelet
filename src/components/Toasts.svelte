<script lang="ts">
  import { fly } from 'svelte/transition';
  import { ui } from '../lib/store/ui.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    <div class="toast" in:fly={{ y: 12, duration: 180 }} out:fly={{ y: 6, duration: 140 }}>
      <span>{t.text}</span>
      {#if t.action}
        <button
          onclick={() => {
            t.action?.run();
            ui.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 9px 9px 9px 16px;
    min-height: 38px;
    border-radius: 99px;
    background: var(--inv-bg);
    color: var(--inv-fg);
    font-size: 13px;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.12), var(--shadow-float);
    white-space: nowrap;
  }
  .toast:not(:has(button)) {
    padding-right: 16px;
  }
  button {
    height: 24px;
    padding: 0 11px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--inv-fg) 16%, transparent);
    color: var(--inv-fg);
    font-size: 12.5px;
    font-weight: 500;
  }
  button:hover {
    background: color-mix(in srgb, var(--inv-fg) 26%, transparent);
  }
</style>
