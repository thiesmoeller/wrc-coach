import { describe, it, expect, beforeEach } from 'vitest';
import { StrokeDetector } from '../StrokeDetector';

describe('StrokeDetector', () => {
  let detector: StrokeDetector;

  beforeEach(() => {
    detector = new StrokeDetector({
      catchThreshold: 0.6,
      finishThreshold: -0.3,
    });
  });

  it('initializes in recovery phase', () => {
    expect(detector.isInDrive()).toBe(false);
    expect(detector.getStrokeCount()).toBe(0);
  });

  it('detects catch (start of drive)', () => {
    const result = detector.process(1000, 0.7); // Above catch threshold
    
    expect(detector.isInDrive()).toBe(true);
    expect(detector.getStrokeCount()).toBe(1);
    expect(result).toBeNull(); // No completed stroke yet
  });

  it('detects finish (end of drive)', () => {
    // Simulate catch
    detector.process(1000, 0.7);
    expect(detector.isInDrive()).toBe(true);
    
    // Simulate finish
    const result = detector.process(1500, -0.4); // Below finish threshold
    
    expect(detector.isInDrive()).toBe(false);
    expect(result).not.toBeNull();
    expect(result?.driveTime).toBe(500);
  });

  it('calculates stroke metrics', () => {
    // First stroke
    detector.process(1000, 0.7);  // Catch
    detector.process(1500, -0.4); // Finish (drive: 500ms)
    
    // Second stroke
    detector.process(3000, 0.7);  // Catch (recovery: 1500ms)
    const result = detector.process(3600, -0.4); // Finish (drive: 600ms)
    
    expect(result).not.toBeNull();
    expect(result?.driveTime).toBe(600);
    expect(result?.recoveryTime).toBe(1500);
    
    // Stroke rate = 60000 / (600 + 1500) = ~28.6 SPM
    expect(result?.strokeRate).toBeGreaterThan(28);
    expect(result?.strokeRate).toBeLessThan(30);
    
    // Drive % = 600 / 2100 = ~28.6%, rounded to 29%
    expect(result?.drivePercent).toBeGreaterThanOrEqual(28);
    expect(result?.drivePercent).toBeLessThanOrEqual(29);
  });

  it('tracks all strokes', () => {
    // Simulate 3 strokes
    for (let i = 0; i < 3; i++) {
      detector.process(i * 2000, 0.7);      // Catch
      detector.process(i * 2000 + 500, -0.4); // Finish
    }
    
    const allStrokes = detector.getAllStrokes();
    expect(allStrokes).toHaveLength(3);
  });

  it('can be reset', () => {
    detector.process(1000, 0.7);
    expect(detector.getStrokeCount()).toBe(1);
    
    detector.reset();
    expect(detector.getStrokeCount()).toBe(0);
    expect(detector.isInDrive()).toBe(false);
  });

  it('calculates stroke angle correctly', () => {
    detector.process(1000, 0.7); // Catch at t=1000
    
    // At catch
    expect(detector.getStrokeAngle(1000)).toBe(0);
    
    // Mid-drive (approximately)
    const midDriveAngle = detector.getStrokeAngle(1350);
    expect(midDriveAngle).toBeGreaterThan(0);
    expect(midDriveAngle).toBeLessThan(180);
  });
});

