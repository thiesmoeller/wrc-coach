import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeepAwakeNotice } from '../KeepAwakeNotice';

const base = {
  recording: true,
  wakeLockSupported: true,
  wakeLockActive: true,
  interruptionCount: 0,
  totalHiddenMs: 0,
};

describe('KeepAwakeNotice', () => {
  it('renders nothing when not recording', () => {
    const { container } = render(<KeepAwakeNotice {...base} recording={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the keep-awake guidance while recording with the lock held', () => {
    render(<KeepAwakeNotice {...base} wakeLockActive />);
    expect(screen.getByText('Screen kept awake')).toBeInTheDocument();
    expect(screen.getByText(/Keep WRC Coach open/i)).toBeInTheDocument();
    // No interruption alert yet.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns when the wake lock is unsupported', () => {
    render(<KeepAwakeNotice {...base} wakeLockSupported={false} wakeLockActive={false} />);
    expect(screen.getByText(/Screen-awake unavailable/i)).toBeInTheDocument();
  });

  it('flags a single interruption with a seconds duration', () => {
    render(<KeepAwakeNotice {...base} interruptionCount={1} totalHiddenMs={8000} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Recording interrupted 1 time');
    expect(alert).toHaveTextContent('(8s in the background)');
  });

  it('flags multiple interruptions with a minutes+seconds duration', () => {
    render(<KeepAwakeNotice {...base} interruptionCount={3} totalHiddenMs={65000} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Recording interrupted 3 times');
    expect(alert).toHaveTextContent('(1m 05s in the background)');
  });
});
