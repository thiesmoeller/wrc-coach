import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import type { AppSettings } from '../../hooks/useSettings';

const settings: AppSettings = {
  historyStrokes: 2,
  trailOpacity: 40,
  sampleRate: 20,
  disablePlots: false,
  demoMode: false,
};

describe('SettingsPanel', () => {
  beforeEach(() => {
    (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = '2.5.0';
    (globalThis as unknown as { __GIT_COMMIT__: string }).__GIT_COMMIT__ = 'abc123';
    (globalThis as unknown as { __GIT_BRANCH__: string }).__GIT_BRANCH__ = 'main';
    (globalThis as unknown as { __GIT_TAG__: string }).__GIT_TAG__ = '';
    (globalThis as unknown as { __GIT_DIRTY__: string }).__GIT_DIRTY__ = 'false';
  });

  it('does not expose calibration, stroke thresholds, or phone direction', () => {
    render(
      <SettingsPanel
        isOpen
        onClose={() => {}}
        settings={settings}
        updateSettings={() => {}}
        resetSettings={() => {}}
      />,
    );

    expect(screen.queryByText(/Phone Calibration/i)).toBeNull();
    expect(screen.queryByText(/Catch Threshold/i)).toBeNull();
    expect(screen.queryByText(/Finish Threshold/i)).toBeNull();
    expect(screen.queryByText(/Phone Orientation/i)).toBeNull();
    expect(screen.queryByText(/facing stern/i)).toBeNull();
    expect(screen.queryByText(/Coxswain/i)).toBeNull();

    expect(screen.getByText('Visualization')).toBeInTheDocument();
    expect(screen.getByLabelText('Demo Mode (Simulated Data)')).toBeInTheDocument();
  });
});
