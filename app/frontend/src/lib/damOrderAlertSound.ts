let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass();
  return audioContext;
}

export async function primeDamOrderAlertSound(): Promise<void> {
  const ctx = context();
  if (ctx?.state === 'suspended') await ctx.resume();
}

export async function playDamOrderAlertSound(): Promise<void> {
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === 'suspended') await ctx.resume();

  const start = ctx.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.18, 1046], [0.36, 1318]] as const) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.14);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.15);
  }
}
