import { describe, expect, it } from 'vitest';
import { estimateOutputLatencyMs, isTimingSensitiveReliable } from '../latency';

describe('latency estimate', () => {
  it('uses offset only when context fields missing', () => {
    expect(estimateOutputLatencyMs(null, 50)).toBe(50);
    expect(estimateOutputLatencyMs({}, 0)).toBe(0);
  });

  it('combines base and output latency with offset', () => {
    expect(
      estimateOutputLatencyMs({ baseLatency: 0.01, outputLatency: 0.02 }, 100)
    ).toBeCloseTo(130, 5);
  });

  it('reliability flag at threshold', () => {
    expect(isTimingSensitiveReliable(80, 80)).toBe(true);
    expect(isTimingSensitiveReliable(80.01, 80)).toBe(false);
    expect(isTimingSensitiveReliable(40, 80)).toBe(true);
  });
});
