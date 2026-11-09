<script lang="ts">
  import { ui } from '../lib/store/ui.svelte';
  import { settings, prefersReducedMotion } from '../lib/store/settings.svelte';
  import { formatTime } from '../lib/stats/format';
  import { fly, fade } from 'svelte/transition';

  let canvas: HTMLCanvasElement | undefined = $state();
  let banner: { id: number; lines: string[] } | null = $state(null);
  let raf = 0;

  interface P {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    vr: number;
    s: number;
    a: number;
    shade: number;
  }

  function burst() {
    if (!canvas || prefersReducedMotion()) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const el = document.querySelector('[data-timer-anchor]');
    let anchor = el?.getBoundingClientRect();
    // The clock may still be gliding back from the centre of the screen: aim where it comes to rest.
    const glide = el?.closest('[data-glide]');
    if (anchor && glide) {
      const m = new DOMMatrix(getComputedStyle(glide).transform);
      anchor = new DOMRect(anchor.x - m.e, anchor.y - m.f, anchor.width, anchor.height);
    }
    const cx = anchor ? anchor.left + anchor.width / 2 : w / 2;
    const cy = anchor ? anchor.top + anchor.height / 2 : h * 0.45;
    const rx = anchor ? anchor.width / 2 : 160;
    const ry = anchor ? anchor.height / 2 : 60;
    const css = getComputedStyle(document.documentElement);
    const fg = css.getPropertyValue('--fg-base').trim() || '#000';
    const accent = document.documentElement.dataset.accent === 'on' ? css.getPropertyValue('--accent').trim() : '';
    const ps: P[] = [];
    for (let i = 0; i < 80; i++) {
      // Start on the edge of the digits and fly outward, so the new time stays readable.
      const ang = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 8;
      ps.push({
        x: cx + Math.cos(ang) * rx * 0.9,
        y: cy + Math.sin(ang) * ry * 0.9,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * 0.8 - 3,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        s: 4 + Math.random() * 7,
        a: 1,
        shade: Math.random(),
      });
    }
    cancelAnimationFrame(raf);
    let lastT = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(2.5, (t - lastT) / 16.7);
      lastT = t;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of ps) {
        p.vy += 0.3 * dt;
        p.vx *= 0.985 ** dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        p.a -= 0.014 * dt;
        if (p.a <= 0) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.a) * (0.35 + p.shade * 0.65);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        const col = accent && p.shade > 0.55 ? accent : fg;
        const s = p.s;
        if (p.shade > 0.5) {
          ctx.fillStyle = col;
          ctx.fillRect(-s / 2, -s / 2, s, s);
        } else {
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = col;
          ctx.strokeRect(-s / 2, -s / 2, s, s);
        }
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
  }

  const LABEL: Record<string, string> = { single: 'single' };

  $effect(() => {
    const c = ui.celebration;
    if (!c) return;
    let lines: string[];
    if (c.milestone) lines = [`${c.milestone.toLocaleString()} solves in this session`];
    else {
      if (!settings.celebrate) return;
      lines = c.pbs.map((p) => `New best ${LABEL[p.label] ?? p.label} · ${formatTime(p.value, settings.precision)}`);
      burst();
    }
    banner = { id: c.id, lines: lines.slice(0, 3) };
    const id = c.id;
    const t = setTimeout(() => {
      if (banner?.id === id) banner = null;
    }, 3200);
    return () => clearTimeout(t);
  });
</script>

<canvas bind:this={canvas} class="fx" aria-hidden="true"></canvas>
{#if banner}
  {#key banner.id}
    <div class="banner" in:fly={{ y: -10, duration: 260 }} out:fade={{ duration: 300 }} role="status">
      {#each banner.lines as l, i}
        <div class="line" style="animation-delay:{i * 90}ms">{l}</div>
      {/each}
    </div>
  {/key}
{/if}

<style>
  .fx {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 150;
  }
  .banner {
    position: fixed;
    top: calc(var(--topbar-h) + 18px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 151;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }
  .line {
    padding: 7px 16px;
    border-radius: 99px;
    background: var(--accent);
    color: var(--accent-fg);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.01em;
    font-variant-numeric: tabular-nums;
    box-shadow: var(--shadow-lg);
    animation: pop 0.5s var(--ease) both;
  }
  @keyframes pop {
    from {
      transform: scale(0.9);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
