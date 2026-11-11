import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import type { AppSettings } from '../../hooks/useSettings';

const settings: AppSettings = {
  historyStrokes: 2,
  trailOpacity: 40,
  sampleRate: 20,
  disablePlots: false,
  demoMode: false,
  demoScenario: 'skiffApproachWobble',
};

describe('SettingsPanel', () => {
  beforeEach(() => {
    (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = '2.5.0';
    (globalThis as unknown as { __GIT_COMMIT__: string }).__GIT_COMMIT__ = 'abc123';
    (globalThis as unknown as { __GIT_BRANCH__: string }).__GIT_BRANCH__ = 'main';
    (globalThis as unknown as { __GIT_TAG__: string }).__GIT_TAG__ = '';
    (globalThis as unknown as { __GIT_DIRTY__: string }).__GIT_DIRTY__ = 'false';
    (globalThis as unknown as { __BUILD_DATE__: string }).__BUILD_DATE__ = '2026-09-08T11:02:39Z';
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
    expect(screen.getByText('Git Commit:')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getByText('2026-09-08')).toBeInTheDocument();
    expect(screen.queryByText(new Date().toISOString().slice(0, 10))).toBeNull();
  });

  it('offers the demo scenario next to the demo toggle only while demo mode is on', () => {
    const { rerender } = render(
      <SettingsPanel
        isOpen
        onClose={() => {}}
        settings={settings}
        updateSettings={() => {}}
        resetSettings={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Demo scenario')).toBeNull();

    rerender(
      <SettingsPanel
        isOpen
        onClose={() => {}}
        settings={{ ...settings, demoMode: true, demoScenario: 'crewCatchSpread' }}
        updateSettings={() => {}}
        resetSettings={() => {}}
      />,
    );
    const select = screen.getByLabelText('Demo scenario') as HTMLSelectElement;
    expect(select.value).toBe('crewCatchSpread');
    expect(select.selectedOptions[0].textContent).toBe('Crew: catches spread 60 ms');
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Single scull: wobbly approach');
    expect(select.options).toHaveLength(8);
    expect(select.closest('.setting-item')?.querySelector('#demoMode')).not.toBeNull();
  });

  it('updates the demo scenario setting when another one is chosen', () => {
    const updateSettings = vi.fn();
    render(
      <SettingsPanel
        isOpen
        onClose={() => {}}
        settings={{ ...settings, demoMode: true }}
        updateSettings={updateSettings}
        resetSettings={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Demo scenario'), { target: { value: 'startFromRest' } });
    expect(updateSettings).toHaveBeenCalledWith({ demoScenario: 'startFromRest' });
  });
});
