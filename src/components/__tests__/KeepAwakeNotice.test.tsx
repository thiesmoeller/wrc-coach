import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeepAwakeNotice, KEEP_AWAKE_INTRO_KEY } from '../KeepAwakeNotice';

const base = {
  recording: false,
  wakeLockSupported: true,
  wakeLockActive: true,
  interruptionCount: 0,
  totalHiddenMs: 0,
};

describe('KeepAwakeNotice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows a first-run intro on a new device, not a live recording banner', () => {
    render(<KeepAwakeNotice {...base} />);
    expect(screen.getByRole('dialog', { name: /keep wrc coach open/i })).toBeInTheDocument();
    expect(screen.getByText(/keeps the screen awake/i)).toBeInTheDocument();
    expect(screen.queryByText('Screen kept awake')).toBeNull();
  });

  it('does not show the intro again after it has been dismissed on this device', () => {
    const { rerender } = render(<KeepAwakeNotice {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(localStorage.getItem(KEEP_AWAKE_INTRO_KEY)).toBe('1');
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(<KeepAwakeNotice {...base} recording />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/Screen kept awake/i)).toBeNull();
    expect(screen.queryByText(/Keeping screen awake/i)).toBeNull();
  });

  it('skips the intro when this device has already seen it', () => {
    localStorage.setItem(KEEP_AWAKE_INTRO_KEY, '1');
    const { container } = render(<KeepAwakeNotice {...base} recording />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains when the phone cannot keep the screen awake', () => {
    render(<KeepAwakeNotice {...base} wakeLockSupported={false} wakeLockActive={false} />);
    expect(screen.getByText(/cannot keep the screen awake automatically/i)).toBeInTheDocument();
  });

  it('still flags a single interruption with a seconds duration', () => {
    localStorage.setItem(KEEP_AWAKE_INTRO_KEY, '1');
    render(<KeepAwakeNotice {...base} recording interruptionCount={1} totalHiddenMs={8000} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Recording interrupted 1 time');
    expect(alert).toHaveTextContent('(8s in the background)');
    expect(screen.queryByText('Screen kept awake')).toBeNull();
  });

  it('still flags multiple interruptions with a minutes+seconds duration', () => {
    localStorage.setItem(KEEP_AWAKE_INTRO_KEY, '1');
    render(<KeepAwakeNotice {...base} recording interruptionCount={3} totalHiddenMs={65000} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Recording interrupted 3 times');
    expect(alert).toHaveTextContent('(1m 05s in the background)');
  });

  it('does not show interruption alerts when not recording', () => {
    localStorage.setItem(KEEP_AWAKE_INTRO_KEY, '1');
    const { container } = render(
      <KeepAwakeNotice {...base} recording={false} interruptionCount={2} totalHiddenMs={4000} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
