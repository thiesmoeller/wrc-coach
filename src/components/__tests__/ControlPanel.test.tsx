import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ControlPanel } from '../ControlPanel';

describe('ControlPanel', () => {
  it('renders three actions in a single toolbar', () => {
    render(
      <ControlPanel
        isRunning={false}
        onSessions={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
      />
    );

    const toolbar = document.querySelector('.control-panel');
    expect(toolbar).not.toBeNull();
    expect(screen.getByRole('button', { name: /sessions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
    expect(toolbar?.querySelectorAll('button')).toHaveLength(3);
  });
});
