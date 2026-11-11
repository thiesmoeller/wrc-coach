import { describe, it, expect } from 'vitest';
import { AccelSignDetector, isAppleMobile, upInDevice } from '../AccelSignDetector';
import { createSyntheticRowerStream, SCENARIOS } from '../../analysis/SyntheticRower';

const D2R = Math.PI / 180;

/** `getRotationMatrix` as printed in the W3C DeviceOrientation spec (device -> earth, row-major). */
function specRotationMatrix(alpha: number, beta: number, gamma: number): number[] {
  const _x = beta * D2R;
  const _y = gamma * D2R;
  const _z = alpha * D2R;
  const cX = Math.cos(_x);
  const cY = Math.cos(_y);
  const cZ = Math.cos(_z);
  const sX = Math.sin(_x);
  const sY = Math.sin(_y);
  const sZ = Math.sin(_z);
  return [
    cZ * cY - sZ * sX * sY, -cX * sZ, cY * sZ * sX + cZ * sY,
    cY * sZ + cZ * sX * sY, cZ * cX, sZ * sY - cZ * cY * sX,
    -cX * sY, sX, cX * cY,
  ];
}

/** Tilt angles a spec-conformant `deviceorientation` would report for a given up direction. */
function tiltFor(up: { x: number; y: number; z: number }): { beta: number; gamma: number } {
  return { beta: Math.asin(up.y) / D2R, gamma: Math.atan2(-up.x, up.z) / D2R };
}

function feedRowing(detector: AccelSignDetector, platformSign: 1 | -1, samples: number): void {
  const stream = createSyntheticRowerStream({ ...SCENARIOS.skiffApproachWobble, mountPitchDeg: 55, mountRollDeg: -8 });
  const { beta, gamma } = tiltFor(stream.upPhone);
  for (let i = 0; i < samples; i++) {
    const { sample } = stream.nextImu();
    detector.observe(platformSign * sample.ax, platformSign * sample.ay, platformSign * sample.az, beta, gamma);
  }
}

describe('upInDevice', () => {
  it('matches the examples in the W3C spec', () => {
    // Flat, screen up: accelerationIncludingGravity is {0, 0, 9.8}.
    const flat = upInDevice(0, 0);
    expect(flat.x).toBeCloseTo(0, 12);
    expect(flat.y).toBeCloseTo(0, 12);
    expect(flat.z).toBeCloseTo(1, 12);
    // Screen vertical, top of the screen up: beta = 90 whatever gamma is.
    for (const gamma of [-60, 0, 35]) {
      const up = upInDevice(90, gamma);
      expect(up.x).toBeCloseTo(0, 12);
      expect(up.y).toBeCloseTo(1, 12);
      expect(up.z).toBeCloseTo(0, 12);
    }
    // Screen vertical, top of the screen to the user's right (gamma = 90): the right-hand edge (+x) points down.
    const side = upInDevice(0, 90);
    expect(side.x).toBeCloseTo(-1, 12);
    expect(side.y).toBeCloseTo(0, 12);
    expect(side.z).toBeCloseTo(0, 12);
    // Face down.
    expect(upInDevice(180, 0).z).toBeCloseTo(-1, 12);
  });

  it('is the earth-up row of the spec rotation matrix for any alpha', () => {
    for (const alpha of [0, 77, 213]) {
      for (const beta of [-170, -90, -31, 0, 12, 64, 90, 135]) {
        for (const gamma of [-89, -40, 0, 23, 71]) {
          const m = specRotationMatrix(alpha, beta, gamma);
          const up = upInDevice(beta, gamma);
          expect(up.x).toBeCloseTo(m[6], 12);
          expect(up.y).toBeCloseTo(m[7], 12);
          expect(up.z).toBeCloseTo(m[8], 12);
          expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1, 12);
        }
      }
    }
  });
});

describe('AccelSignDetector', () => {
  it('uses the fallback until a full window of paired samples has arrived', () => {
    const ios = new AccelSignDetector({ fallbackInverted: true, windowSamples: 12 });
    expect(ios.sign).toBe(-1);
    expect(ios.source).toBe('fallback');

    const android = new AccelSignDetector({ fallbackInverted: false, windowSamples: 12 });
    feedRowing(android, -1, 11);
    expect(android.sign).toBe(1);
    expect(android.source).toBe('fallback');
    expect(android.isDecided).toBe(false);
  });

  it('keeps W3C-convention data as it is, whatever the fallback said', () => {
    for (const fallbackInverted of [false, true]) {
      const d = new AccelSignDetector({ fallbackInverted });
      feedRowing(d, 1, 12);
      expect(d.sign).toBe(1);
      expect(d.inverted).toBe(false);
      expect(d.source).toBe('data');
    }
  });

  it('detects an inverted platform from data, whatever the fallback said', () => {
    for (const fallbackInverted of [false, true]) {
      const d = new AccelSignDetector({ fallbackInverted });
      feedRowing(d, -1, 12);
      expect(d.sign).toBe(-1);
      expect(d.inverted).toBe(true);
      expect(d.source).toBe('data');
    }
  });

  it('normalises an inverted platform so gravity reads positive along up', () => {
    const stream = createSyntheticRowerStream(SCENARIOS.skiffSteady);
    const { beta, gamma } = tiltFor(stream.upPhone);
    const d = new AccelSignDetector({ fallbackInverted: false });
    let along = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const { sample } = stream.nextImu();
      const raw = { x: -sample.ax, y: -sample.ay, z: -sample.az };
      d.observe(raw.x, raw.y, raw.z, beta, gamma);
      if (i >= 12) {
        along += d.sign * (raw.x * stream.upPhone.x + raw.y * stream.upPhone.y + raw.z * stream.upPhone.z);
      }
    }
    expect(along / (n - 12)).toBeGreaterThan(9);
  });

  it('latches: later contradictory data never flips the decision', () => {
    const d = new AccelSignDetector({ fallbackInverted: true });
    feedRowing(d, 1, 12);
    expect(d.sign).toBe(1);
    feedRowing(d, -1, 500);
    expect(d.sign).toBe(1);
    expect(d.source).toBe('data');
  });

  it('does not decide without a clear margin', () => {
    const d = new AccelSignDetector({ fallbackInverted: true, windowSamples: 8, marginMps2: 5 });
    // Gravity-free acceleration (the `acceleration` fallback channel) and a sign that keeps changing.
    for (let i = 0; i < 400; i++) {
      const s = i % 2 === 0 ? 1 : -1;
      d.observe(0.4 * s, 2.5 * s, 3 * s, 20, 5);
    }
    expect(d.isDecided).toBe(false);
    expect(d.sign).toBe(-1);
    expect(d.source).toBe('fallback');

    // A clear window afterwards still decides.
    for (let i = 0; i < 8; i++) d.observe(0, 0, 9.81, 0, 0);
    expect(d.sign).toBe(1);
    expect(d.source).toBe('data');
  });

  it('ignores samples that are not finite numbers', () => {
    const d = new AccelSignDetector({ fallbackInverted: false, windowSamples: 4 });
    for (let i = 0; i < 20; i++) d.observe(NaN, 0, -9.81, 0, 0);
    for (let i = 0; i < 20; i++) d.observe(0, 0, -9.81, NaN, 0);
    expect(d.isDecided).toBe(false);
    for (let i = 0; i < 4; i++) d.observe(0, 0, -9.81, 0, 0);
    expect(d.sign).toBe(-1);
  });

  it('never changes the sign in use while locked; applies the decision when the lock lifts', () => {
    const d = new AccelSignDetector({ fallbackInverted: false });
    d.setLocked(true);
    feedRowing(d, -1, 100);
    expect(d.isDecided).toBe(true);
    expect(d.pending).toBe(true);
    expect(d.sign).toBe(1);
    expect(d.source).toBe('fallback');

    d.setLocked(false);
    expect(d.sign).toBe(-1);
    expect(d.pending).toBe(false);
    expect(d.source).toBe('data');

    d.setLocked(true);
    d.setLocked(false);
    expect(d.sign).toBe(-1);
  });

  it('applies a decision reached before the lock immediately and keeps it through the lock', () => {
    const d = new AccelSignDetector({ fallbackInverted: false });
    feedRowing(d, -1, 12);
    d.setLocked(true);
    expect(d.sign).toBe(-1);
    expect(d.pending).toBe(false);
  });
});

describe('isAppleMobile', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const iphoneChrome =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1';
  const ipadClassic =
    'Mozilla/5.0 (iPad; CPU OS 12_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1';
  const mac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  const android =
    'Mozilla/5.0 (Linux; Android 14; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36';

  it('recognises iPhone and iPad browsers', () => {
    expect(isAppleMobile({ userAgent: iphone, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: iphoneChrome, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: ipadClassic, platform: 'iPad', maxTouchPoints: 5 })).toBe(true);
  });

  it('recognises iPadOS presenting itself as a Mac by its touch points', () => {
    expect(isAppleMobile({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });

  it('does not match Android or a missing navigator', () => {
    expect(isAppleMobile({ userAgent: android, platform: 'Linux armv81', maxTouchPoints: 5 })).toBe(false);
    expect(isAppleMobile(undefined)).toBe(false);
    expect(isAppleMobile({})).toBe(false);
  });
});
