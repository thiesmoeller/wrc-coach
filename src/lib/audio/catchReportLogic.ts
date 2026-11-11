import type {
  CatchReportDecision,
  CatchReportFadeState,
  CatchReportSettings,
  CatchStrokeInput,
  CatchReportMonoSidePattern,
  WobbleLevel,
} from './types';

export function createCatchReportFadeState(): CatchReportFadeState {
  return {
    qualifyingOutOfBandCount: 0,
    recentSeveritySamples: [],
  };
}

export function isCatchInBand(
  input: CatchStrokeInput,
  settings: CatchReportSettings
): boolean {
  const leanOk = Math.abs(input.leanDeg) <= settings.leanTargetBandDeg;
  const wobbleOk = input.approachWobbleDeg <= settings.wobbleTargetBandDeg;
  return leanOk && wobbleOk;
}

export function classifyWobble(wobbleDeg: number, settings: CatchReportSettings): WobbleLevel {
  if (wobbleDeg <= settings.wobbleThresholdSomeDeg) return 'steady';
  if (wobbleDeg <= settings.wobbleThresholdLotDeg) return 'some';
  return 'a lot';
}

export function wobbleToPitchHz(level: WobbleLevel, settings: CatchReportSettings): number {
  switch (level) {
    case 'steady':
      return settings.pitchSteadyHz;
    case 'some':
      return settings.pitchSomeHz;
    case 'a lot':
      return settings.pitchLotHz;
  }
}

export function leanToSide(
  leanDeg: number,
  leanTargetBandDeg: number
): 'left' | 'right' | 'center' {
  if (Math.abs(leanDeg) <= leanTargetBandDeg) return 'center';
  if (leanDeg > 0) return 'left';
  if (leanDeg < 0) return 'right';
  return 'center';
}

export function leanToPan(leanDeg: number, leanTargetBandDeg: number): number {
  const side = leanToSide(leanDeg, leanTargetBandDeg);
  if (side === 'left') return -1;
  if (side === 'right') return 1;
  return 0;
}

export function leanToMonoSidePattern(
  leanDeg: number,
  leanTargetBandDeg: number
): CatchReportMonoSidePattern {
  const side = leanToSide(leanDeg, leanTargetBandDeg);
  if (side === 'center') return 'neutral';
  if (side === 'left') return 'left';
  return 'right';
}

export function severityScore(input: CatchStrokeInput): number {
  return Math.abs(input.leanDeg) + input.approachWobbleDeg;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function everyNthAfterFullFeedback(
  postIndex: number,
  settings: CatchReportSettings
): number {
  const tier = Math.floor((postIndex - 1) / settings.strokesPerFadeTier);
  return Math.min(2 + tier, settings.maxEveryNth);
}

export function shouldPlayEveryNthSchedule(
  qualifyingOutOfBandCount: number,
  settings: CatchReportSettings
): boolean {
  if (qualifyingOutOfBandCount <= settings.fullFeedbackStrokeCount) return true;
  const post = qualifyingOutOfBandCount - settings.fullFeedbackStrokeCount;
  const everyNth = everyNthAfterFullFeedback(post, settings);
  const positionInTier = (post - 1) % settings.strokesPerFadeTier;
  return (positionInTier + 1) % everyNth === 0;
}

/**
 * After the first full-feedback block, beeps thin to every 2nd, then 3rd, then 4th qualifying
 * out-of-band stroke for fixed-size tiers; worse-than-median mode uses the same block then only
 * strokes worse than your recent severity median.
 */
export function shouldPlayCatchReport(
  input: CatchStrokeInput,
  settings: CatchReportSettings,
  state: CatchReportFadeState
): { play: boolean; nextState: CatchReportFadeState } {
  if (isCatchInBand(input, settings)) {
    return { play: false, nextState: state };
  }

  const nextCount = state.qualifyingOutOfBandCount + 1;
  let play: boolean;

  if (settings.fadeMode === 'worseThanMedian') {
    const med = median(state.recentSeveritySamples);
    const worse = state.recentSeveritySamples.length > 0
      ? severityScore(input) > med
      : true;
    const inFull = nextCount <= settings.fullFeedbackStrokeCount;
    play = inFull || worse;
  } else {
    play = shouldPlayEveryNthSchedule(nextCount, settings);
  }

  const nextState: CatchReportFadeState = {
    qualifyingOutOfBandCount: nextCount,
    recentSeveritySamples: [
      ...state.recentSeveritySamples,
      severityScore(input),
    ].slice(-settings.medianWindowSize),
  };

  return { play, nextState };
}

export function simulateCatchReportPlayback(
  inputs: CatchStrokeInput[],
  settings: CatchReportSettings
): boolean[] {
  let state = createCatchReportFadeState();
  return inputs.map((input) => {
    const { play, nextState } = shouldPlayCatchReport(input, settings, state);
    state = nextState;
    return play;
  });
}

export function computeCatchReportDecision(
  input: CatchStrokeInput,
  settings: CatchReportSettings,
  state: CatchReportFadeState,
  monoOutput: boolean
): { decision: CatchReportDecision; nextState: CatchReportFadeState } {
  const { play, nextState } = shouldPlayCatchReport(input, settings, state);
  const wobbleLevel = classifyWobble(input.approachWobbleDeg, settings);
  const pitchHz = wobbleToPitchHz(wobbleLevel, settings);
  const leanSide = leanToSide(input.leanDeg, settings.leanTargetBandDeg);
  const pan = monoOutput ? 0 : leanToPan(input.leanDeg, settings.leanTargetBandDeg);
  const monoSidePattern = leanToMonoSidePattern(
    input.leanDeg,
    settings.leanTargetBandDeg
  );

  return {
    decision: {
      play,
      wobbleLevel,
      pitchHz,
      pan,
      monoSidePattern,
      leanSide,
    },
    nextState,
  };
}
