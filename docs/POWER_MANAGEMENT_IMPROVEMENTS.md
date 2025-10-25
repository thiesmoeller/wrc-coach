# Power Management Improvements

## Summary of Changes

This document describes improvements made to prevent power-saving interruptions during data recording sessions.

## Critical Fix: Wake Lock Auto-Recovery

### Problem
The original wake lock implementation (`useWakeLock.ts`) requested wake lock once on app mount but did not handle automatic release scenarios:

**Wake lock is automatically released when:**
- User switches browser tabs (even briefly)
- Phone screen is turned off manually (power button)
- User switches to another app temporarily  
- Browser loses focus for any reason

**Impact:** Once wake lock is released, screen can dim/lock and **sensor data stops being recorded**. This could silently ruin an entire on-water recording session.

### Solution
Updated `src/hooks/useWakeLock.ts` to:

1. **Listen for wake lock release events**
   ```typescript
   wakeLockRef.current.addEventListener('release', () => {
     console.warn('⚠️ Wake lock released, will re-acquire on visibility change');
     wakeLockRef.current = null;
   });
   ```

2. **Monitor page visibility changes**
   ```typescript
   document.addEventListener('visibilitychange', handleVisibilityChange);
   ```

3. **Auto re-acquire wake lock** when page becomes visible again
   ```typescript
   if (document.visibilityState === 'visible' && !wakeLockRef.current) {
     console.log('🔄 Page visible again, re-acquiring wake lock...');
     requestWakeLock();
   }
   ```

### Benefits
- ✅ Wake lock automatically recovers if temporarily lost
- ✅ User can briefly switch tabs and return without losing screen lock
- ✅ Better resilience against accidental interruptions
- ✅ Console logging helps debug wake lock issues

## Additional Enhancement: Background Detection

### Addition
Added visibility monitoring to `src/App.tsx` that specifically detects when the app goes to background **during an active recording**:

```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (isRunning) {
      if (document.hidden) {
        console.warn('⚠️ App went to background during recording!');
        console.warn('💡 Sensor data may be interrupted. Keep app visible during recording.');
      } else {
        console.log('✅ App is visible again, sensors should resume');
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [isRunning]);
```

### Benefits
- ✅ Clear warning when recording might be interrupted
- ✅ Helps user identify if they accidentally sent app to background
- ✅ Only warns during active recording (not noise when idle)
- ✅ Provides recovery confirmation when app returns to foreground

## Console Logging Improvements

### Wake Lock Status
- `✅ Wake lock acquired` - Initial acquisition successful
- `⚠️ Wake lock released, will re-acquire on visibility change` - Lost but will recover
- `🔄 Page visible again, re-acquiring wake lock...` - Recovery in progress
- `❌ Wake lock request failed` - Not supported or permission denied

### Background Detection (during recording)
- `⚠️ App went to background during recording!` - Critical warning
- `💡 Sensor data may be interrupted. Keep app visible during recording.` - User guidance
- `✅ App is visible again, sensors should resume` - Recovery confirmation

## Remaining Limitations

### Cannot Be Solved by Web App

1. **iOS Background Suspension**
   - iOS Safari suspends all JavaScript after ~30 seconds in background
   - No API exists to prevent this
   - **Mitigation:** User must keep app visible (documented in water test guide)

2. **Android Aggressive Battery Optimization**
   - Some manufacturers kill background processes aggressively
   - Cannot be controlled from web app
   - **Mitigation:** User can disable battery optimization for browser (documented)

3. **Incoming Phone Calls**
   - Full-screen call UI will background the app
   - No way to prevent OS-level interruption
   - **Mitigation:** Enable airplane mode or DND during recording

4. **Hardware Power Button**
   - User pressing power button will sleep screen
   - Wake lock is released immediately
   - **Mitigation:** User education (don't press power button during recording)

## Best Practices for Users

### Critical
1. **Keep app visible** in foreground throughout entire recording session
2. **Don't switch apps** or browser tabs during recording
3. **Don't press power button** during recording
4. **Set screen timeout to "Never"** before recording session
5. **Charge phone to 100%** or keep plugged in

### Recommended
6. Close all other browser tabs before starting
7. Enable airplane mode (with WiFi) to prevent interruptions
8. Disable battery saver mode
9. Test wake lock acquisition before starting (check console)
10. Monitor console logs if possible (remote debugging)

## Testing Recommendations

### Pre-Water Test
1. Test 5-10 minute recording on land with screen visible
2. Test 2-minute recording with brief tab switch (should recover)
3. Verify console logs show wake lock acquisition
4. Check that sample counts increment continuously
5. Export data and verify no gaps in timestamps

### During Water Test
1. Keep phone screen visible to coxswain at all times
2. Monitor recording indicator throughout session
3. Note any unusual behavior or app freezes
4. Check battery drain after session

### Post-Water Test Analysis
1. Verify sample count matches expected (duration × sample rate)
2. Check timestamp continuity in exported `.wrcdata` file
3. Plot accelerometer data to visually inspect for gaps
4. Review console logs (if captured via remote debugging)
5. Calculate actual achieved sample rate

## Files Modified

- `src/hooks/useWakeLock.ts` - Auto-recovery implementation
- `src/App.tsx` - Background detection during recording
- `docs/WATER_TEST_GUIDE.md` - Comprehensive user guide (NEW)
- `docs/POWER_MANAGEMENT_IMPROVEMENTS.md` - This document (NEW)

## Related Documentation

- [Water Test Guide](WATER_TEST_GUIDE.md) - Complete checklist and troubleshooting
- [Phone Calibration Guide](PHONE_CALIBRATION_GUIDE.md) - Sensor calibration process
- [Session Management](SESSION_USER_GUIDE.md) - Recording and exporting sessions
- [Binary Storage Design](BINARY_STORAGE_DESIGN.md) - Data format details

## Version History

- **2024-10-23**: Initial power management improvements
  - Wake lock auto-recovery
  - Background detection during recording
  - Comprehensive water test documentation

---

**Next Steps:**
Test on water and collect data to verify these improvements maintain continuous recording throughout the session.

