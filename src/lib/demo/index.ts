/**
 * Demo mode: a simulated boat, played in real time from the synthetic rower.
 */
export { DemoPacer, type DemoEvent, type DemoPacerOptions } from './DemoPacer';
export { DemoSource, demoSource, type DemoListener, type DemoScheduler } from './DemoSource';
export {
  DEFAULT_DEMO_SCENARIO,
  DEMO_SCENARIOS,
  DEMO_SCENARIO_LABELS,
  isDemoScenario,
  type DemoScenario,
} from './scenarios';
