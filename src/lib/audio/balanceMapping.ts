import type {
  BalanceGate,
  BalanceLiveInput,
  BalanceToneDecision,
  BalanceToneSettings,
  StrokePhase,
} from './types';

/** Positive roll = starboard side down = rower's left hand low. */
export function rollToRowerLowSide(rollDeg: number): 'left' | 'right' | null {
  if (rollDeg > 0) return 'left';
  if (rollDeg < 0) return 'right';
  return null;
}

export function rollToPan(rollDeg: number): number {
  const side = rollToRowerLowSide(rollDeg);
  if (side === 'left') return -1;
  if (side === 'right') return 1;
  return 0;
}

export function phasePassesGate(phase: StrokePhase, gate: BalanceGate): boolean {
  switch (gate) {
    case 'always':
      return true;
    case 'recovery':
      return phase === 'recovery' || phase === 'approach';
    case 'approach':
      return phase === 'approach';
  }
}

export function leanToGain(leanBeyondDeadBandDeg: number, fullScaleLeanDeg: number): number {
  if (leanBeyondDeadBandDeg <= 0 || fullScaleLeanDeg <= 0) return 0;
  const t = Math.min(1, leanBeyondDeadBandDeg / fullScaleLeanDeg);
  return t * t;
}

export interface BalanceHysteresisState {
  wasAudible: boolean;
}

export function balanceExitEdgeDeg(settings: BalanceToneSettings): number {
  return settings.deadBandDeg - settings.hysteresisDeg;
}

export function balanceEnterEdgeDeg(settings: BalanceToneSettings): number {
  return settings.deadBandDeg + settings.hysteresisDeg;
}

export function balanceWouldBeAudible(
  rollDeg: number,
  settings: BalanceToneSettings,
  state: BalanceHysteresisState
): boolean {
  const abs = Math.abs(rollDeg);
  if (state.wasAudible) return abs > balanceExitEdgeDeg(settings);
  return abs > balanceEnterEdgeDeg(settings);
}

/** Continuous in |roll|; zero at the exit edge. */
export function continuousLeanMagnitude(
  rollDeg: number,
  settings: BalanceToneSettings
): number {
  return Math.max(0, Math.abs(rollDeg) - balanceExitEdgeDeg(settings));
}

export function effectiveLeanWithHysteresis(
  rollDeg: number,
  settings: BalanceToneSettings,
  state: BalanceHysteresisState
): number {
  if (!balanceWouldBeAudible(rollDeg, settings, state)) return 0;
  return continuousLeanMagnitude(rollDeg, settings);
}

export function computeBalanceTone(
  input: BalanceLiveInput,
  settings: BalanceToneSettings,
  hysteresis: BalanceHysteresisState,
  monoOutput: boolean
): BalanceToneDecision & { hysteresis: BalanceHysteresisState } {
  const leanBeyond = effectiveLeanWithHysteresis(input.rollDeg, settings, hysteresis);
  const gateOpen = phasePassesGate(input.phase, settings.gate);
  const gain = gateOpen ? leanToGain(leanBeyond, settings.fullScaleLeanDeg) : 0;
  const toneActive = gateOpen && balanceWouldBeAudible(input.rollDeg, settings, hysteresis);
  const audible = gain > 0;
  const lowSide = audible ? rollToRowerLowSide(input.rollDeg) : null;
  const pan = monoOutput ? 0 : rollToPan(input.rollDeg);

  let pitchHz = settings.stereoPitchHz;
  if (monoOutput && audible && lowSide) {
    pitchHz =
      lowSide === 'left' ? settings.monoPitchLeftHz : settings.monoPitchRightHz;
  }

  return {
    audible,
    pan,
    pitchHz,
    gain,
    lowSide,
    hysteresis: { wasAudible: toneActive },
  };
}
