import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_COACH_SETTINGS } from '../settings';
import {
  computeBalanceTone,
  continuousLeanMagnitude,
  effectiveLeanWithHysteresis,
  leanToGain,
  phasePassesGate,
  rollToPan,
  rollToRowerLowSide,
} from '../balanceMapping';

const balance = DEFAULT_AUDIO_COACH_SETTINGS.balance;

describe('rower POV side mapping', () => {
  it('maps starboard-down (positive roll) to left ear and left mono pitch', () => {
    expect(rollToRowerLowSide(2)).toBe('left');
    expect(rollToPan(2)).toBe(-1);
    const stereo = computeBalanceTone(
      { rollDeg: 2, phase: 'approach' },
      balance,
      { wasAudible: true },
      false
    );
    expect(stereo.pan).toBe(-1);
    const mono = computeBalanceTone(
      { rollDeg: 2, phase: 'approach' },
      balance,
      { wasAudible: true },
      true
    );
    expect(mono.pitchHz).toBe(balance.monoPitchLeftHz);
  });

  it('maps port-down (negative roll) to right ear and right mono pitch', () => {
    expect(rollToRowerLowSide(-2)).toBe('right');
    expect(rollToPan(-2)).toBe(1);
    const mono = computeBalanceTone(
      { rollDeg: -2, phase: 'approach' },
      balance,
      { wasAudible: true },
      true
    );
    expect(mono.pitchHz).toBe(balance.monoPitchRightHz);
  });
});

describe('gate per phase', () => {
  const phases = ['drive', 'recovery', 'approach'] as const;
  const matrix: Record<string, Record<string, boolean>> = {
    always: { drive: true, recovery: true, approach: true },
    recovery: { drive: false, recovery: true, approach: true },
    approach: { drive: false, recovery: false, approach: true },
  };

  for (const gate of ['always', 'recovery', 'approach'] as const) {
    for (const phase of phases) {
      it(`${gate} gate during ${phase}`, () => {
        expect(phasePassesGate(phase, gate)).toBe(matrix[gate][phase]);
      });
    }
  }
});

describe('leanToGain', () => {
  it('is zero at edge and monotonic bounded', () => {
    expect(leanToGain(0, 3)).toBe(0);
    const g1 = leanToGain(0.5, 3);
    const g2 = leanToGain(1.5, 3);
    const g3 = leanToGain(6, 3);
    expect(g2).toBeGreaterThan(g1);
    expect(g3).toBeLessThanOrEqual(1);
    expect(g3).toBe(1);
  });
});

describe('hysteresis loudness continuity', () => {
  const states = [
    { label: 'cold', wasAudible: false },
    { label: 'warm', wasAudible: true },
  ] as const;

  for (const state of states) {
    it(`non-decreasing gain sweep when ${state.label}`, () => {
      let prevGain = -1;
      for (let h = 0; h <= 500; h++) {
        const roll = h * 0.01;
        const lean = effectiveLeanWithHysteresis(roll, balance, state);
        const gain = leanToGain(lean, balance.fullScaleLeanDeg);
        expect(gain).toBeGreaterThanOrEqual(prevGain - 1e-9);
        if (prevGain > 0 && gain > 0) {
          expect(gain - prevGain).toBeLessThanOrEqual(0.02);
        }
        prevGain = gain;
      }
    });
  }

  it('fixes the 0.50 vs 0.51 discontinuity when warm', () => {
    const s = { wasAudible: true };
    expect(effectiveLeanWithHysteresis(0.5, balance, s)).toBeCloseTo(0.15, 5);
    expect(effectiveLeanWithHysteresis(0.51, balance, s)).toBeCloseTo(0.16, 5);
    expect(effectiveLeanWithHysteresis(0.51, balance, s)).toBeGreaterThan(
      effectiveLeanWithHysteresis(0.5, balance, s)
    );
  });

  it('matches continuousLeanMagnitude when audible', () => {
    const roll = 1.2;
    const s = { wasAudible: true };
    expect(effectiveLeanWithHysteresis(roll, balance, s)).toBe(
      continuousLeanMagnitude(roll, balance)
    );
  });
});
