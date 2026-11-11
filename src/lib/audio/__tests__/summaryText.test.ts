import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_COACH_SETTINGS } from '../settings';
import { buildSpokenSummary, createSummarySchedulerState, shouldSpeakSummary } from '../summaryText';

describe('buildSpokenSummary each field missing', () => {
  it('rate only', () => {
    expect(
      buildSpokenSummary({
        strokeRateSpm: 22,
        meanCatchLeanDeg: null,
        wobbleTrend: null,
      })
    ).toBe('Rate 22.');
  });

  it('lean only', () => {
    expect(
      buildSpokenSummary({
        strokeRateSpm: null,
        meanCatchLeanDeg: -1.2,
        wobbleTrend: null,
      })
    ).toBe('Catch set 1.2 degrees right.');
  });

  it('wobble trend only', () => {
    expect(
      buildSpokenSummary({
        strokeRateSpm: null,
        meanCatchLeanDeg: null,
        wobbleTrend: 'up',
      })
    ).toBe('Wobble up.');
  });

  it('all missing', () => {
    expect(
      buildSpokenSummary({
        strokeRateSpm: null,
        meanCatchLeanDeg: null,
        wobbleTrend: null,
      })
    ).toBe('No new summary data');
  });

  it('full phrase', () => {
    expect(
      buildSpokenSummary({
        strokeRateSpm: 20.4,
        meanCatchLeanDeg: 1.44,
        wobbleTrend: 'down',
      })
    ).toBe('Rate 20. Catch set 1.4 degrees left. Wobble down.');
  });
});

describe('summary scheduler', () => {
  it('stroke interval', () => {
    let state = createSummarySchedulerState();
    const s = { ...DEFAULT_AUDIO_COACH_SETTINGS.spokenSummary, enabledMetreInterval: false };
    for (let i = 0; i < 19; i++) {
      state = shouldSpeakSummary(state, 1, 0, s).nextState;
    }
    expect(shouldSpeakSummary(state, 1, 0, s).speak).toBe(true);
  });

  it('metre interval', () => {
    let state = createSummarySchedulerState();
    const s = {
      everyNStrokes: 100,
      everyMetres: 50,
      enabledStrokeInterval: false,
      enabledMetreInterval: true,
    };
    state = shouldSpeakSummary(state, 0, 40, s).nextState;
    expect(shouldSpeakSummary(state, 0, 10, s).speak).toBe(true);
  });
});
