import { describe, it, expect, beforeEach } from 'vitest';
import { InterruptionTracker } from '../InterruptionTracker';

describe('InterruptionTracker', () => {
  let tracker: InterruptionTracker;

  beforeEach(() => {
    tracker = new InterruptionTracker();
  });

  it('starts clean', () => {
    expect(tracker.getCount()).toBe(0);
    expect(tracker.isHidden()).toBe(false);
    expect(tracker.getTotalHiddenMs()).toBe(0);
    expect(tracker.getInterruptions()).toEqual([]);
  });

  it('records a single hidden→visible interruption with duration', () => {
    tracker.markHidden(1000);
    expect(tracker.isHidden()).toBe(true);
    expect(tracker.getCount()).toBe(1);

    tracker.markVisible(4500);
    expect(tracker.isHidden()).toBe(false);
    expect(tracker.getCount()).toBe(1);
    expect(tracker.getTotalHiddenMs()).toBe(3500);

    const [it0] = tracker.getInterruptions();
    expect(it0.hiddenAt).toBe(1000);
    expect(it0.visibleAt).toBe(4500);
    expect(it0.durationMs).toBe(3500);
  });

  it('accumulates multiple interruptions', () => {
    tracker.markHidden(0);
    tracker.markVisible(1000);
    tracker.markHidden(5000);
    tracker.markVisible(5500);

    expect(tracker.getCount()).toBe(2);
    expect(tracker.getTotalHiddenMs()).toBe(1500);
  });

  it('dedupes repeated markHidden without an intervening markVisible', () => {
    tracker.markHidden(100);
    tracker.markHidden(200); // ignored
    expect(tracker.getCount()).toBe(1);
    expect(tracker.isHidden()).toBe(true);

    tracker.markVisible(300);
    expect(tracker.getCount()).toBe(1);
    expect(tracker.getTotalHiddenMs()).toBe(200);
  });

  it('ignores markVisible when not hidden', () => {
    tracker.markVisible(500); // no-op
    expect(tracker.getCount()).toBe(0);
    expect(tracker.isHidden()).toBe(false);
  });

  it('counts elapsed time of an open interruption when now is supplied', () => {
    tracker.markHidden(1000);
    expect(tracker.getTotalHiddenMs()).toBe(0); // no `now` → open gap excluded
    expect(tracker.getTotalHiddenMs(3000)).toBe(2000); // open gap counted up to now
  });

  it('never returns negative durations from out-of-order timestamps', () => {
    tracker.markHidden(5000);
    tracker.markVisible(4000); // clock skew
    expect(tracker.getTotalHiddenMs()).toBe(0);
  });

  it('resets to a clean state', () => {
    tracker.markHidden(0);
    tracker.markVisible(1000);
    tracker.reset();
    expect(tracker.getCount()).toBe(0);
    expect(tracker.isHidden()).toBe(false);
    expect(tracker.getTotalHiddenMs()).toBe(0);
  });
});
