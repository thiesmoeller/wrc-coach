import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_COACH_SETTINGS } from '../settings';
import type { CatchReportSettings, CatchStrokeInput } from '../types';
import {
  classifyWobble,
  computeCatchReportDecision,
  createCatchReportFadeState,
  isCatchInBand,
  leanToMonoSidePattern,
  leanToPan,
  leanToSide,
  shouldPlayCatchReport,
  shouldPlayEveryNthSchedule,
  simulateCatchReportPlayback,
  wobbleToPitchHz,
} from '../catchReportLogic';

const cr = DEFAULT_AUDIO_COACH_SETTINGS.catchReport;
const oob: CatchStrokeInput = { leanDeg: 1.2, approachWobbleDeg: 0.8 };

describe('in-band silence at edges', () => {
  it('is silent at band limits and out when either metric exceeds', () => {
    expect(isCatchInBand({ leanDeg: 0.5, approachWobbleDeg: 0.4 }, cr)).toBe(true);
    expect(isCatchInBand({ leanDeg: 0.51, approachWobbleDeg: 0.4 }, cr)).toBe(false);
    expect(isCatchInBand({ leanDeg: 0.2, approachWobbleDeg: 0.41 }, cr)).toBe(false);
  });
});

describe('wobble pitch steps at thresholds', () => {
  it('steps at 0.4 and 1.0 deg defaults', () => {
    expect(wobbleToPitchHz(classifyWobble(0.39, cr), cr)).toBe(cr.pitchSteadyHz);
    expect(wobbleToPitchHz(classifyWobble(0.4, cr), cr)).toBe(cr.pitchSteadyHz);
    expect(wobbleToPitchHz(classifyWobble(0.41, cr), cr)).toBe(cr.pitchSomeHz);
    expect(wobbleToPitchHz(classifyWobble(1.0, cr), cr)).toBe(cr.pitchSomeHz);
    expect(wobbleToPitchHz(classifyWobble(1.01, cr), cr)).toBe(cr.pitchLotHz);
  });
});

describe('side encoding respects lean target band', () => {
  it('uses center pan and neutral mono when lean is in band', () => {
    expect(leanToSide(0.05, cr.leanTargetBandDeg)).toBe('center');
    expect(leanToSide(0, cr.leanTargetBandDeg)).toBe('center');
    expect(leanToPan(0.05, cr.leanTargetBandDeg)).toBe(0);
    expect(leanToMonoSidePattern(0.05, cr.leanTargetBandDeg)).toBe('neutral');
    expect(leanToSide(0.6, cr.leanTargetBandDeg)).toBe('left');
    expect(leanToMonoSidePattern(-0.6, cr.leanTargetBandDeg)).toBe('right');
    expect(leanToPan(0.6, cr.leanTargetBandDeg)).toBe(-1);
    expect(leanToPan(-0.6, cr.leanTargetBandDeg)).toBe(1);
  });
});

describe('fade schedule everyNth exact indices', () => {
  const small: CatchReportSettings = {
    ...cr,
    fullFeedbackStrokeCount: 3,
    strokesPerFadeTier: 4,
    maxEveryNth: 4,
  };

  function expectedPlayback(settings: CatchReportSettings): boolean[] {
    return Array.from({ length: 16 }, (_, i) =>
      shouldPlayEveryNthSchedule(i + 1, settings)
    );
  }

  it('matches simulateCatchReportPlayback for 16 strokes', () => {
    const inputs = Array.from({ length: 16 }, () => oob);
    const sim = simulateCatchReportPlayback(inputs, small);
    expect(sim).toEqual(expectedPlayback(small));
    expect(sim.slice(0, 3)).toEqual([true, true, true]);
    expect(sim.filter(Boolean).length).toBeLessThan(16);
  });

  it('100-stroke sequence thins after full-feedback block', () => {
    const inputs = Array.from({ length: 100 }, () => oob);
    const sim = simulateCatchReportPlayback(inputs, cr);
    expect(sim.slice(0, cr.fullFeedbackStrokeCount).every(Boolean)).toBe(true);
    expect(sim.filter(Boolean).length).toBeGreaterThan(cr.fullFeedbackStrokeCount);
    expect(sim.filter(Boolean).length).toBeLessThan(100);
  });
});

describe('worseThanMedian fade', () => {
  it('plays all strokes in full-feedback block then only worse than median', () => {
    const settings: CatchReportSettings = {
      ...cr,
      fadeMode: 'worseThanMedian',
      fullFeedbackStrokeCount: 3,
      medianWindowSize: 5,
    };
    let state = createCatchReportFadeState();
    const mild = { leanDeg: 0.6, approachWobbleDeg: 0.5 };
    const harsh = { leanDeg: 1.5, approachWobbleDeg: 1.2 };

    const first: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const { play, nextState } = shouldPlayCatchReport(mild, settings, state);
      first.push(play);
      state = nextState;
    }
    expect(first).toEqual([true, true, true]);

    for (let i = 0; i < 6; i++) {
      const r = shouldPlayCatchReport(harsh, settings, state);
      state = r.nextState;
    }
    expect(shouldPlayCatchReport(mild, settings, state).play).toBe(false);
    const worse = { leanDeg: 2, approachWobbleDeg: 1.5 };
    expect(shouldPlayCatchReport(worse, settings, state).play).toBe(true);
  });
});

describe('computeCatchReportDecision', () => {
  it('wobble-only out of band gets neutral side', () => {
    const { decision } = computeCatchReportDecision(
      { leanDeg: 0.1, approachWobbleDeg: 0.9 },
      cr,
      createCatchReportFadeState(),
      true
    );
    expect(decision.leanSide).toBe('center');
    expect(decision.monoSidePattern).toBe('neutral');
  });
});
