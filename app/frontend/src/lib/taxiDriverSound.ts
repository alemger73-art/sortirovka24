/** Yandex Taxi–style new-order chime (synthesized, two ascending tones). */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, volume = 0.35) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export function playTaxiNewOrderSound() {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    // Два восходящих тона — узнаваемый «такси»-сигнал
    tone(ctx, 784, t, 0.18, 0.4);       // G5
    tone(ctx, 988, t + 0.16, 0.22, 0.45); // B5
    tone(ctx, 1175, t + 0.34, 0.28, 0.5); // D6
  } catch {
    /* silent fallback */
  }
}

export async function unlockTaxiSound() {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();
  } catch {
    /* ignore */
  }
}
