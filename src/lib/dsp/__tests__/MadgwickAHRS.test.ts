import { describe, it, expect } from 'vitest';
import { MadgwickAHRS } from '../MadgwickAHRS';

const G = 9.81;
const dt = 0.02; // 50 Hz

describe('MadgwickAHRS', () => {
  it('converges to level orientation from a flat still accelerometer', () => {
    const ahrs = new MadgwickAHRS(0.3);
    ahrs.initFromAccel(0, 0, G);
    for (let i = 0; i < 500; i++) ahrs.update(0, 0, 0, 0, 0, G, dt);

    const grav = ahrs.getGravitySensor();
    expect(grav.z).toBeCloseTo(1, 2);
    expect(Math.abs(grav.x)).toBeLessThan(0.02);
    expect(Math.abs(grav.y)).toBeLessThan(0.02);

    // A sensor-frame vertical vector maps to earth vertical.
    const up = ahrs.toEarth({ x: 0, y: 0, z: G });
    expect(up.z).toBeCloseTo(G, 1);
  });

  it('recovers a static tilt (phone pitched forward ~30°)', () => {
    // Phone pitched about X by 30°: gravity leaks into the Y axis.
    const theta = (30 * Math.PI) / 180;
    const ax = 0;
    const ay = G * Math.sin(theta);
    const az = G * Math.cos(theta);

    const ahrs = new MadgwickAHRS(0.3);
    ahrs.initFromAccel(ax, ay, az);
    for (let i = 0; i < 800; i++) ahrs.update(0, 0, 0, ax, ay, az, dt);

    // Gravity direction in the sensor frame should match the input direction.
    const grav = ahrs.getGravitySensor();
    const n = Math.hypot(ax, ay, az);
    expect(grav.x).toBeCloseTo(ax / n, 1);
    expect(grav.y).toBeCloseTo(ay / n, 1);
    expect(grav.z).toBeCloseTo(az / n, 1);
  });

  it('removes gravity: static linear acceleration is ~0 in earth frame', () => {
    const ahrs = new MadgwickAHRS(0.2);
    ahrs.initFromAccel(0, 0, G);
    let lin = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 600; i++) {
      ahrs.update(0, 0, 0, 0, 0, G, dt);
      const e = ahrs.toEarth({ x: 0, y: 0, z: G });
      lin = { x: e.x, y: e.y, z: e.z - G };
    }
    expect(Math.hypot(lin.x, lin.y, lin.z)).toBeLessThan(0.1);
  });

  it('tracks a pure gyro rotation about Z', () => {
    const ahrs = new MadgwickAHRS(0); // pure integration
    ahrs.initFromAccel(0, 0, G);
    const rate = (10 * Math.PI) / 180; // 10 deg/s about Z
    const steps = Math.round(1 / dt); // 1 second → ~10°
    for (let i = 0; i < steps; i++) ahrs.update(0, 0, rate, 0, 0, G, dt);
    // Gravity stays vertical (rotation about Z doesn't tip gravity).
    const grav = ahrs.getGravitySensor();
    expect(grav.z).toBeCloseTo(1, 2);
  });
});
