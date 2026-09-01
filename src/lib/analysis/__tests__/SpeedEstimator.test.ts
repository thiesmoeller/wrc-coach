import { describe, it, expect } from 'vitest';
import { SpeedEstimator } from '../SpeedEstimator';

const dt = 0.02;

describe('SpeedEstimator', () => {
  it('converges to a constant GPS speed', () => {
    const est = new SpeedEstimator();
    for (let i = 0; i < 500; i++) {
      est.predict(0, dt);
      if (i % 50 === 0) est.updateGps(4.0, 3);
    }
    // Constant speed with zero acceleration: speed/bias are weakly coupled, so
    // allow a small residual around the GPS truth.
    expect(est.getSpeed()).toBeGreaterThan(3.7);
    expect(est.getSpeed()).toBeLessThan(4.3);
  });

  it('estimates and removes a constant accelerometer bias', () => {
    // True speed constant at 4 m/s, but the accelerometer has a +0.3 m/s² bias.
    const est = new SpeedEstimator();
    est.updateGps(4.0, 3);
    for (let i = 0; i < 3000; i++) {
      est.predict(0.3, dt); // biased "acceleration" while truly cruising
      if (i % 50 === 0) est.updateGps(4.0, 3); // 1 Hz GPS says still 4 m/s
    }
    // The filter should attribute the drift to bias, keeping speed near 4.
    expect(est.getSpeed()).toBeGreaterThan(3.5);
    expect(est.getSpeed()).toBeLessThan(4.5);
    expect(est.getBias()).toBeGreaterThan(0.1);
  });

  it('integrates distance consistent with speed', () => {
    const est = new SpeedEstimator();
    // Prime to ~4 m/s then coast for 10 s.
    for (let i = 0; i < 200; i++) {
      est.predict(0, dt);
      est.updateGps(4.0, 3);
    }
    const d0 = est.getDistance();
    for (let i = 0; i < 500; i++) est.predict(0, dt); // 10 s
    const traveled = est.getDistance() - d0;
    expect(traveled).toBeGreaterThan(38);
    expect(traveled).toBeLessThan(44);
  });

  it('rejects gross GPS outliers via the innovation gate', () => {
    const est = new SpeedEstimator();
    for (let i = 0; i < 300; i++) {
      est.predict(0, dt);
      est.updateGps(4.0, 3);
    }
    const before = est.getSpeed();
    const accepted = est.updateGps(40, 3); // absurd jump
    expect(accepted).toBe(false);
    expect(est.getSpeed()).toBeCloseTo(before, 1);
  });

  it('never reports negative speed', () => {
    const est = new SpeedEstimator();
    for (let i = 0; i < 200; i++) est.predict(-5, dt); // strong (unphysical) decel
    expect(est.getSpeed()).toBeGreaterThanOrEqual(0);
  });
});
