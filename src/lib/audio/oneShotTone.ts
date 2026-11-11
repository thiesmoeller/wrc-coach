import type { AudioContextLike } from './webAudioTypes';

export interface OneShotToneOptions {
  frequencyHz: number;
  durationSec: number;
  gainLevel: number;
  pan: number;
  useStereoPanner: boolean;
  masterVolume: number;
  when?: number;
}

export function playOneShotTone(
  ctx: AudioContextLike,
  options: OneShotToneOptions
): boolean {
  if (ctx.state !== 'running') return false;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = Math.min(2000, Math.max(500, options.frequencyHz));
  const start = options.when ?? ctx.currentTime;
  const peak = options.gainLevel * options.masterVolume;
  const durationSec = options.durationSec;

  gain.gain.value = 0;
  if (gain.gain.setValueAtTime) {
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime?.(peak, start + 0.005);
    if (gain.gain.setTargetAtTime) {
      gain.gain.setTargetAtTime(0, start + durationSec * 0.6, 0.02);
    } else {
      gain.gain.value = 0;
    }
  }

  if (options.useStereoPanner && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = options.pan;
    osc.connect(panner);
    panner.connect(gain);
  } else {
    osc.connect(gain);
  }
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationSec);
  return true;
}
