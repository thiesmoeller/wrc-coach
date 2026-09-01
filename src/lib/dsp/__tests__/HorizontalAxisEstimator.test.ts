import { describe, it, expect } from 'vitest';
import { HorizontalAxisEstimator } from '../HorizontalAxisEstimator';

const dt = 0.02;

describe('HorizontalAxisEstimator', () => {
  it('recovers the fore–aft axis from oscillation along a 40° heading', () => {
    const est = new HorizontalAxisEstimator(4);
    const heading = (40 * Math.PI) / 180;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);

    for (let i = 0; i < 2000; i++) {
      const t = i * dt;
      // Asymmetric drive: sharp positive spike (skewed) along the heading.
      const cyc = (t % 2.4) / 2.4;
      const drive = cyc < 0.3 ? 3 * Math.sin((cyc / 0.3) * Math.PI) : -0.4 * Math.sin(((cyc - 0.3) / 0.7) * Math.PI);
      est.update(drive * fx, drive * fy, dt);
    }

    expect(est.isReady()).toBe(true);
    const f = est.getForward();
    // Axis aligned with the heading, and sign toward the drive spike (+).
    const align = f.x * fx + f.y * fy;
    expect(align).toBeGreaterThan(0.95);

    // Starboard axis is orthogonal.
    const s = est.getStarboard();
    expect(Math.abs(f.x * s.x + f.y * s.y)).toBeLessThan(1e-6);
  });

  it('is stable (no 180° flapping) for a symmetric signal', () => {
    const est = new HorizontalAxisEstimator(4);
    for (let i = 0; i < 1000; i++) {
      const v = Math.sin(i * 0.2) * 2;
      est.update(v, 0, dt);
    }
    const f = est.getForward();
    expect(Math.abs(Math.abs(f.x) - 1)).toBeLessThan(0.05);
    expect(Math.abs(f.y)).toBeLessThan(0.05);
  });
});
