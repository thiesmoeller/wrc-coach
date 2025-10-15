import { describe, it, expect, beforeEach } from 'vitest';
import { KalmanFilterGPS } from '../KalmanFilterGPS';

describe('KalmanFilterGPS', () => {
  let filter: KalmanFilterGPS;

  beforeEach(() => {
    filter = new KalmanFilterGPS();
  });

  it('initializes with zero velocity', () => {
    expect(filter.getVelocity()).toBe(0);
  });

  it('predicts velocity based on acceleration', () => {
    // Predict with 1 m/s² acceleration for 1 second
    filter.predict(1.0, 1.0);
    expect(filter.getVelocity()).toBeCloseTo(1.0, 5);
  });

  it('updates velocity with GPS measurement', () => {
    // Set a velocity then update with GPS
    filter.predict(2.0, 1.0); // v = 2 m/s
    filter.updateGPS(3.0); // GPS says 3 m/s
    
    // Velocity should be between 2 and 3 (Kalman gain dependent)
    const velocity = filter.getVelocity();
    expect(velocity).toBeGreaterThan(2.0);
    expect(velocity).toBeLessThan(3.0);
  });

  it('can be reset', () => {
    filter.predict(5.0, 1.0);
    expect(filter.getVelocity()).not.toBe(0);
    
    filter.reset();
    expect(filter.getVelocity()).toBe(0);
  });

  it('fuses IMU and GPS measurements', () => {
    // Simulate multiple updates
    filter.predict(1.0, 0.1); // 0.1 m/s
    filter.updateIMU(0.15);   // IMU says 0.15 m/s
    filter.predict(1.0, 0.1); // 0.25 m/s
    filter.updateGPS(0.3);    // GPS says 0.3 m/s
    
    const velocity = filter.getVelocity();
    // Should be close to 0.3 but influenced by previous measurements
    expect(velocity).toBeGreaterThan(0.2);
    expect(velocity).toBeLessThan(0.4);
  });
});

