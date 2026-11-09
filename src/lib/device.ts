/** Small wrappers around device APIs: screen wake lock, haptics and fullscreen. All optional. */

let lock: { release: () => Promise<void> } | null = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock || document.visibilityState !== 'visible') return;
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void>; addEventListener: (e: string, f: () => void) => void }> } };
    if (!nav.wakeLock) return;
    const l = await nav.wakeLock.request('screen');
    if (!wanted) {
      void l.release();
      return;
    }
    lock = l;
    l.addEventListener('release', () => {
      if (lock === l) lock = null;
    });
  } catch {
    /* denied (battery saver, unsupported, not visible) */
  }
}

if (typeof document !== 'undefined') {
  // The browser drops the lock whenever the tab is hidden; take it back on return.
  document.addEventListener('visibilitychange', () => void acquire());
}

/** Keep the screen on (true) or let it sleep again (false). Safe to call repeatedly. */
export function keepAwake(on: boolean) {
  wanted = on;
  if (on) void acquire();
  else if (lock) {
    const l = lock;
    lock = null;
    void l.release().catch(() => {});
  }
}

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement;
}

export async function toggleFullscreen(): Promise<boolean> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* not allowed (iOS Safari, iframes) */
  }
  return isFullscreen();
}

export const isTouchDevice = typeof matchMedia !== 'undefined' && matchMedia('(hover: none) and (pointer: coarse)').matches;
