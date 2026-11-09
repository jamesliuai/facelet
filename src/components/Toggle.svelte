<script lang="ts">
  let { checked = $bindable(false), label = '', onchange }: { checked?: boolean; label?: string; onchange?: (v: boolean) => void } = $props();
</script>

<button
  class="toggle"
  class:on={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  onclick={() => {
    checked = !checked;
    onchange?.(checked);
  }}
>
  <span class="knob"></span>
</button>

<style>
  .toggle {
    position: relative;
    width: 36px;
    height: 21px;
    border-radius: 99px;
    background: var(--line-2);
    box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.08);
    transition: background 0.2s var(--ease);
    flex: none;
  }
  .toggle.on {
    background: var(--accent);
  }
  .knob {
    position: absolute;
    top: 2.5px;
    left: 2.5px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bg-base);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.22), 0 2px 6px -2px rgb(0 0 0 / 0.18);
    transition: transform 0.32s var(--spring);
  }
  .toggle.on .knob {
    transform: translateX(15px);
    background: var(--accent-fg);
  }
</style>
