import { useState, useEffect } from 'react';

export interface AppSettings {
  historyStrokes: number;
  trailOpacity: number;
  sampleRate: number;
  /** When true, do not render any plots (reduces CPU/memory) */
  disablePlots: boolean;
  demoMode: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  historyStrokes: 2,
  trailOpacity: 40,
  sampleRate: 20,
  disablePlots: false,
  demoMode: false,
};

const SETTINGS_KEY = 'strokeCoachSettings';

/** Keys that used to be user-tunable and are now inferred from IMU data. */
const LEGACY_SETTING_KEYS = [
  'catchThreshold',
  'finishThreshold',
  'phoneOrientation',
] as const;

/**
 * Hook to manage app settings with localStorage persistence
 */
export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        for (const key of LEGACY_SETTING_KEYS) {
          delete parsed[key];
        }
        return { ...DEFAULT_SETTINGS, ...(parsed as Partial<AppSettings>) };
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    }
    return DEFAULT_SETTINGS;
  });

  // Save to localStorage whenever settings change
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  };

  const resetSettings = () => {
    setSettingsState(DEFAULT_SETTINGS);
  };

  return {
    settings,
    updateSettings,
    resetSettings,
  };
}
