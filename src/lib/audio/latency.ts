export interface LatencyContextLike {
  baseLatency?: number;
  outputLatency?: number;
}

export function estimateOutputLatencyMs(
  context: LatencyContextLike | null,
  latencyOffsetMs: number
): number {
  const base = context?.baseLatency ?? 0;
  const output = context?.outputLatency ?? 0;
  return Math.max(0, latencyOffsetMs + (base + output) * 1000);
}

export function isTimingSensitiveReliable(
  estimatedLatencyMs: number,
  thresholdMs: number
): boolean {
  return estimatedLatencyMs <= thresholdMs;
}
