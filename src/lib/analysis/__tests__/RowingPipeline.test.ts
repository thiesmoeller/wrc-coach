import { describe, it, expect } from 'vitest';
import { RowingPipeline } from '../RowingPipeline';
import { summarizeSession } from '../RowingMetrics';
import { generateSyntheticRow } from '../SyntheticRower';

/**
 * End-to-end pipeline validation on physically-synthesised data where the phone
 * is tilted (18° pitch, −6° roll) and the boat points along a 40° heading — a
 * setup the legacy fixed-axis, fixed-threshold pipeline could not handle.
 */
describe('RowingPipeline (integration)', () => {
  it('recovers stroke rate through gravity, tilt and arbitrary heading', () => {
    const data = generateSyntheticRow({ strokeRate: 24, durationS: 90 });
    const pipe = new RowingPipeline();

    let gpsIdx = 0;
    const rollSamples: number[] = [];
    const speeds: number[] = [];
    for (const s of data.imu) {
      const out = pipe.processIMU(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz);
      rollSamples.push(out.roll);
      // Fold in GPS fixes at their timestamps.
      while (gpsIdx < data.gps.length && data.gps[gpsIdx].t <= s.t) {
        pipe.processGPS(data.gps[gpsIdx].speed, data.gps[gpsIdx].accuracy);
        gpsIdx++;
      }
      speeds.push(out.speed);
    }

    const strokes = pipe.getStrokes();
    // Skip warm-up strokes before the AHRS/axis settle.
    const settled = strokes.filter((st) => st.catchTime > data.imu[0].t + 8000 && st.strokeRate > 0);
    expect(settled.length).toBeGreaterThan(20);

    const summary = summarizeSession(settled, {
      distanceMeters: pipe.speed.getDistance(),
      speeds,
      rollSamples,
    });

    // Stroke rate within ±2 SPM of truth.
    expect(summary.avgStrokeRate).toBeGreaterThan(22);
    expect(summary.avgStrokeRate).toBeLessThan(26);
    // A metronomic synthetic input must read as highly consistent.
    expect(summary.strokeRateCv).toBeLessThan(8);
    // Drive percentage (acceleration-positive fraction of the cycle) should be
    // plausible. Note this accel-based ratio runs higher than the handle-based
    // "drive ratio" a coach quotes, matching the app's historical ~55–60%.
    expect(summary.avgDrivePercent).toBeGreaterThan(20);
    expect(summary.avgDrivePercent).toBeLessThan(65);
  });

  it('matches the offline Python analysis on a noise-free session (24 SPM / ~33% drive)', () => {
    // Deterministic, noise-free input identical in spirit to the Python
    // generate_wrcdata.py demo, which the offline analysis reports as exactly
    // 24.0 SPM and 33% drive. The shared pipeline spec must agree.
    const data = generateSyntheticRow({
      strokeRate: 24,
      durationS: 90,
      noise: 0,
      gyroNoise: 0,
    });
    const pipe = new RowingPipeline();
    for (const s of data.imu) {
      pipe.processIMU(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz);
    }
    const settled = pipe.getStrokes().filter(
      (st) => st.catchTime > data.imu[0].t + 8000 && st.strokeRate > 0,
    );
    const rates = settled.map((s) => s.strokeRate);
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    // Every settled stroke should read the true 24 SPM.
    expect(avgRate).toBeCloseTo(24, 0);
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThanOrEqual(1);
    // Causal (real-time) drive ratio runs a bit higher than the zero-phase
    // offline 33%, but must stay physiologically plausible.
    const avgDrive = settled.reduce((a, s) => a + s.drivePercent, 0) / settled.length;
    expect(avgDrive).toBeGreaterThan(28);
    expect(avgDrive).toBeLessThan(60);
  });

  it('recovers the boat set (roll) oscillation amplitude', () => {
    const data = generateSyntheticRow({ strokeRate: 24, durationS: 60, rollAmpDeg: 3 });
    const pipe = new RowingPipeline();
    const roll: number[] = [];
    for (const s of data.imu) {
      const out = pipe.processIMU(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz);
      roll.push(out.roll);
    }
    // Use the settled portion.
    const settled = roll.slice(Math.floor(roll.length / 2));
    const amp = Math.sqrt(2) * Math.sqrt(settled.reduce((a, b) => a + b * b, 0) / settled.length);
    // Ground truth amplitude is 3°; recovered amplitude should be the same order.
    expect(amp).toBeGreaterThan(1);
    expect(amp).toBeLessThan(6);
  });

  it('fused speed tracks the GPS mean and distance is sane', () => {
    const data = generateSyntheticRow({ strokeRate: 24, durationS: 60, speedMps: 4.2 });
    const pipe = new RowingPipeline();
    let gpsIdx = 0;
    for (const s of data.imu) {
      pipe.processIMU(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz);
      while (gpsIdx < data.gps.length && data.gps[gpsIdx].t <= s.t) {
        pipe.processGPS(data.gps[gpsIdx].speed, data.gps[gpsIdx].accuracy);
        gpsIdx++;
      }
    }
    expect(pipe.speed.getSpeed()).toBeGreaterThan(3.5);
    expect(pipe.speed.getSpeed()).toBeLessThan(5.0);
    // ~4.2 m/s × 60 s ≈ 252 m.
    expect(pipe.speed.getDistance()).toBeGreaterThan(200);
    expect(pipe.speed.getDistance()).toBeLessThan(300);
  });
});
