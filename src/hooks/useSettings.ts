import { useState, useEffect } from 'react';

export interface AppSettings {
  historyStrokes: number;
  trailOpacity: number;
  demoMode: boolean;
  phoneOrientation: 'rower' | 'coxswain';
}

const DEFAULT_SETTINGS: AppSettings = {
  historyStrokes: 2,
  trailOpacity: 40,
  demoMode: false,
  phoneOrientation: 'rower',
};

const SETTINGS_KEY = 'strokeCoachSettings';

/**
 * Hook to manage app settings with localStorage persistence
 */
export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
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

