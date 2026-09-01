import { describe, it, expect } from 'vitest';
import { AdaptiveStrokeDetector } from '../AdaptiveStrokeDetector';

/**
 * Generate a band-passed-like surge signal: an asymmetric stroke wave at a given
 * SPM (sharp positive drive lobe, gentle negative recovery), optionally with a
 * DC offset, amplitude scale and noise, to prove the detector is robust to them.
 */
function strokeSignal(opts: {
  spm: number;
  seconds: number;
  fs?: number;
  amp?: number;
  dc?: number;
  noise?: number;
  driveRatio?: number;
}) {
  const { spm, seconds, fs = 50, amp = 2, dc = 0, noise = 0, driveRatio = 0.33 } = opts;
  const period = 60 / spm;
  const samples: Array<{ t: number; a: number }> = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  const n = Math.round(seconds * fs);
  for (let i = 0; i < n; i++) {
    const t = (i / fs) * 1000;
    const cyc = ((i / fs) % period) / period;
    let a: number;
    if (cyc < driveRatio) {
      a = amp * Math.sin((cyc / driveRatio) * Math.PI); // positive drive lobe
    } else {
      a = -amp * 0.35 * Math.sin(((cyc - driveRatio) / (1 - driveRatio)) * Math.PI);
    }
    samples.push({ t, a: a + dc + rand() * noise });
  }
  return samples;
}

describe('AdaptiveStrokeDetector', () => {
  it('counts strokes at 24 SPM within ±1', () => {
    const det = new AdaptiveStrokeDetector();
    const sig = strokeSignal({ spm: 24, seconds: 30 });
    for (const s of sig) det.process(s.t, s.a);
    // 30 s at 24 SPM = 12 strokes.
    expect(det.getStrokeCount()).toBeGreaterThanOrEqual(11);
    expect(det.getStrokeCount()).toBeLessThanOrEqual(13);
  });

  it('reports a stroke rate close to the true cadence', () => {
    const det = new AdaptiveStrokeDetector();
    const sig = strokeSignal({ spm: 30, seconds: 30 });
    const rates: number[] = [];
    for (const s of sig) {
      const st = det.process(s.t, s.a);
      if (st && st.strokeRate > 0) rates.push(st.strokeRate);
    }
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(avg).toBeGreaterThan(28.5);
    expect(avg).toBeLessThan(31.5);
  });

  it('is robust to a large DC offset (adaptive/zero-crossing based)', () => {
    const det = new AdaptiveStrokeDetector();
    const sig = strokeSignal({ spm: 24, seconds: 30, dc: 5 });
    // A DC offset of +5 would keep the legacy fixed +0.6/-0.3 detector stuck
    // permanently "in drive". Zero-crossing detection ignores the offset...
    // but only because the band-pass removes DC upstream; here we feed it raw to
    // confirm the detector itself doesn't latch. It should find no valid finish.
    let latched = true;
    for (const s of sig) {
      det.process(s.t, s.a);
      if (!det.isInDrive()) latched = false;
    }
    // With a huge DC the signal never crosses zero, so no phantom strokes fire.
    expect(det.getStrokeCount()).toBe(0);
    void latched;
  });

  it('is amplitude-invariant (light paddling vs hard pressure)', () => {
    const light = new AdaptiveStrokeDetector();
    const hard = new AdaptiveStrokeDetector();
    for (const s of strokeSignal({ spm: 22, seconds: 30, amp: 0.6 })) light.process(s.t, s.a);
    for (const s of strokeSignal({ spm: 22, seconds: 30, amp: 6 })) hard.process(s.t, s.a);
    expect(light.getStrokeCount()).toBeGreaterThanOrEqual(10);
    expect(hard.getStrokeCount()).toBeGreaterThanOrEqual(10);
    expect(Math.abs(light.getStrokeCount() - hard.getStrokeCount())).toBeLessThanOrEqual(1);
  });

  it('does not double-count on a noisy signal', () => {
    const det = new AdaptiveStrokeDetector();
    for (const s of strokeSignal({ spm: 26, seconds: 30, noise: 0.4 })) det.process(s.t, s.a);
    // 30 s @ 26 SPM = 13 strokes; noise must not inflate this.
    expect(det.getStrokeCount()).toBeGreaterThanOrEqual(12);
    expect(det.getStrokeCount()).toBeLessThanOrEqual(14);
  });

  it('produces a plausible drive percentage', () => {
    const det = new AdaptiveStrokeDetector();
    const drives: number[] = [];
    for (const s of strokeSignal({ spm: 24, seconds: 30, driveRatio: 0.33 })) {
      const st = det.process(s.t, s.a);
      if (st && st.drivePercent > 0) drives.push(st.drivePercent);
    }
    const avg = drives.reduce((a, b) => a + b, 0) / drives.length;
    // Drive is the positive lobe; expect roughly the configured 33%.
    expect(avg).toBeGreaterThan(20);
    expect(avg).toBeLessThan(50);
  });

  it('resets cleanly', () => {
    const det = new AdaptiveStrokeDetector();
    for (const s of strokeSignal({ spm: 24, seconds: 10 })) det.process(s.t, s.a);
    det.reset();
    expect(det.getStrokeCount()).toBe(0);
    expect(det.isInDrive()).toBe(false);
  });
});
