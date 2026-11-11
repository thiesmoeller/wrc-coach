import { SCENARIOS } from '../analysis/SyntheticRower';

export type DemoScenario = keyof typeof SCENARIOS;

export const DEFAULT_DEMO_SCENARIO: DemoScenario = 'skiffApproachWobble';

export const DEMO_SCENARIO_LABELS: Record<DemoScenario, string> = {
  skiffSteady: 'Single scull: steady and level',
  skiffApproachDrift: 'Single scull: leans 2° into the catch',
  skiffApproachWobble: 'Single scull: wobbly approach',
  skiffUnevenCatch: 'Single scull: uneven catch',
  crewTogether: 'Crew: catches together',
  crewCatchSpread: 'Crew: catches spread 60 ms',
  turning: 'Single scull: steady turn to port',
  startFromRest: 'Single scull: start from rest',
};

export const DEMO_SCENARIOS = Object.keys(DEMO_SCENARIO_LABELS) as DemoScenario[];

export function isDemoScenario(value: unknown): value is DemoScenario {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCENARIOS, value);
}
