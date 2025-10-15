import { describe, it, expect, beforeEach } from 'vitest';
import { LowPassFilter } from '../LowPassFilter';

describe('LowPassFilter', () => {
  let filter: LowPassFilter;

  beforeEach(() => {
    filter = new LowPassFilter(0.5); // 50% smoothing
  });

  it('initializes properly', () => {
    const result = filter.process(10);
    expect(result).toBe(10); // First value passes through
  });

  it('smooths noisy signal', () => {
    // Feed noisy square wave
    filter.process(10);
    const result2 = filter.process(0);
    const result3 = filter.process(10);
    
    // Results should be smoothed (not jumping directly)
    expect(result2).toBeGreaterThan(0);
    expect(result2).toBeLessThan(10);
    expect(result3).toBeGreaterThan(result2);
  });

  it('converges to steady value', () => {
    // Feed constant value
    for (let i = 0; i < 10; i++) {
      filter.process(5.0);
    }
    
    const result = filter.process(5.0);
    expect(result).toBeCloseTo(5.0, 1);
  });

  it('can be reset', () => {
    filter.process(100);
    filter.reset();
    
    const result = filter.process(10);
    expect(result).toBe(10); // Behaves like first value again
  });
});

