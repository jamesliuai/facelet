/** Inspection alerts and small UI sounds, generated locally (no audio files). */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function beep(freq = 880, ms = 120, volume = 0.18, count = 1) {
  const a = audio();
  if (!a) return;
  for (let i = 0; i < count; i++) {
    const t0 = a.currentTime + i * (ms / 1000 + 0.08);
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.02);
  }
}

export function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return beep();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    u.volume = 0.9;
    synth.speak(u);
  } catch {
    beep();
  }
}

export function alert(kind: 'voice' | 'beep' | 'none', seconds: number) {
  if (kind === 'none') return;
  if (kind === 'voice') speak(`${seconds === 8 ? 'Eight' : seconds === 12 ? 'Twelve' : seconds} seconds`);
  else beep(seconds === 8 ? 740 : 988, 140, 0.2, seconds === 8 ? 1 : 2);
}

/** Unlock audio on the first user gesture (browsers require it). */
export function unlockAudio() {
  audio();
}

/** Current audio-clock time in seconds (null when audio is unavailable). */
export function audioTime(): number | null {
  const a = audio();
  return a ? a.currentTime : null;
}

/** One metronome click, optionally scheduled at an exact audio-clock time. */
export function metronomeClick(accent = false, at?: number) {
  const a = audio();
  if (!a) return;
  const t0 = Math.max(a.currentTime, at ?? a.currentTime);
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1600 : 1100;
  gain.gain.setValueAtTime(0.12, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + 0.05);
}
