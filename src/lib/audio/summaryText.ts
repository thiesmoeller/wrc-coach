import type { SummaryBlockInput } from './types';

function formatOneDecimal(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

function leanPhrase(leanDeg: number | null): string | null {
  if (leanDeg === null || Number.isNaN(leanDeg)) return null;
  const abs = Math.abs(leanDeg);
  if (abs < 0.05) return 'level at the catch';
  const side = leanDeg > 0 ? 'left' : 'right';
  return `Catch set ${formatOneDecimal(abs)} degrees ${side}`;
}

function wobbleTrendPhrase(
  trend: SummaryBlockInput['wobbleTrend']
): string | null {
  if (trend === null) return null;
  switch (trend) {
    case 'down':
      return 'Wobble down';
    case 'up':
      return 'Wobble up';
    case 'flat':
      return 'Wobble steady';
  }
}

export function buildSpokenSummary(input: SummaryBlockInput): string {
  const parts: string[] = [];

  if (input.strokeRateSpm !== null && !Number.isNaN(input.strokeRateSpm)) {
    parts.push(`Rate ${Math.round(input.strokeRateSpm)}`);
  }

  const lean = leanPhrase(input.meanCatchLeanDeg);
  if (lean) parts.push(lean);

  const wobble = wobbleTrendPhrase(input.wobbleTrend);
  if (wobble) parts.push(wobble);

  if (parts.length === 0) {
    return 'No new summary data';
  }

  return parts.join('. ') + '.';
}

export interface SummarySchedulerState {
  strokesSinceSummary: number;
  metresSinceSummary: number;
}

export function createSummarySchedulerState(): SummarySchedulerState {
  return { strokesSinceSummary: 0, metresSinceSummary: 0 };
}

export function shouldSpeakSummary(
  state: SummarySchedulerState,
  strokeDelta: number,
  metreDelta: number,
  settings: {
    everyNStrokes: number;
    everyMetres: number;
    enabledStrokeInterval: boolean;
    enabledMetreInterval: boolean;
  }
): { speak: boolean; nextState: SummarySchedulerState } {
  const strokes = state.strokesSinceSummary + strokeDelta;
  const metres = state.metresSinceSummary + metreDelta;

  const byStroke =
    settings.enabledStrokeInterval && strokes >= settings.everyNStrokes;
  const byMetre =
    settings.enabledMetreInterval && metres >= settings.everyMetres;

  return {
    speak: byStroke || byMetre,
    nextState: {
      strokesSinceSummary: byStroke ? 0 : strokes,
      metresSinceSummary: byMetre ? 0 : metres,
    },
  };
}
