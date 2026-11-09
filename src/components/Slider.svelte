<script lang="ts">
  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    format = (v: number) => String(v),
    label = '',
  }: { value?: number; min?: number; max?: number; step?: number; format?: (v: number) => string; label?: string } = $props();
  const pct = $derived(((value - min) / (max - min)) * 100);
</script>

<div class="slider">
  <input type="range" {min} {max} {step} bind:value aria-label={label} style="--p:{pct}%" />
  <span class="val num">{format(value)}</span>
</div>

<style>
  .slider {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 220px;
  }
  .val {
    min-width: 54px;
    text-align: right;
    font-size: 12.5px;
    color: var(--fg-2);
  }
  input {
    flex: 1;
    appearance: none;
    -webkit-appearance: none;
    height: 4px;
    border-radius: 4px;
    background: linear-gradient(to right, var(--accent) var(--p), var(--line-2) var(--p));
    outline: none;
    cursor: pointer;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bg-base);
    border: 1.5px solid var(--accent);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.18), 0 3px 8px -3px rgb(0 0 0 / 0.2);
    transition: transform 0.2s var(--spring);
  }
  input:active::-webkit-slider-thumb {
    transform: scale(1.12);
  }
  input::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--bg);
    border: 1.5px solid var(--accent);
  }
</style>
