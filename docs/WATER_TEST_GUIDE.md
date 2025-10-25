# Water Test Guide - Power Management & Data Recording

## Overview

This guide covers critical considerations for your first on-water recording session, with focus on preventing power-saving interruptions and ensuring reliable data collection.

## ✅ What's Already Protected

### Wake Lock Implementation
- **Screen stays on**: Prevents automatic screen dimming/lock during recording
- **Auto-recovery**: If wake lock is lost (tab switch, etc.), it automatically re-acquires when app becomes visible
- **Visibility monitoring**: Console warnings if app goes to background during recording

### Recording State Protection
- **Update blocking**: App updates are deferred during active recording sessions
- **Session isolation**: Each session is self-contained with full metadata

### Data Recording Verification
- **Original sensor data**: Raw accelerometer/gyroscope values are recorded (NOT processed/calibrated data)
- **Binary format**: Efficient `.wrcdata` format suitable for post-processing
- **Complete metadata**: Session includes calibration, settings, and timing information

## ⚠️ Power-Saving Risks & Mitigation

### 1. Wake Lock Can Be Released

**When it happens:**
- User switches tabs (even briefly)
- Phone screen is manually turned off (power button)
- User switches to another app temporarily
- Incoming call/notification full-screen

**Mitigation:**
- ✅ Auto re-acquire implemented (as of this version)
- Monitor console logs for wake lock status
- Wake lock re-activates when you return to the app

**Best Practice:**
- Keep app in foreground and visible during entire recording session
- Don't switch tabs or apps while recording
- Avoid pressing power button during session

### 2. iOS Background Suspension

**Risk:**
- iOS Safari suspends JavaScript execution after ~30 seconds in background
- Sensors stop updating completely
- **No workaround available for web apps**

**Best Practice (iOS):**
- **Keep screen on and app visible at all times**
- Use a phone mount that keeps screen visible
- Consider enabling "Guided Access" mode (iOS accessibility feature):
  1. Settings → Accessibility → Guided Access
  2. Triple-click home button to lock app
  3. Prevents accidental app switching

### 3. Android Battery Optimization

**Risk:**
- Some manufacturers (Samsung, Xiaomi, Huawei) aggressively kill background apps
- "Battery optimization" can throttle PWA performance
- Varies by device

**Best Practice (Android):**
- **Keep screen on and app visible**
- Before recording, disable battery optimization for browser:
  1. Settings → Apps → Chrome/Firefox
  2. Battery → Battery optimization → Don't optimize
- Keep phone plugged in to charger if possible (disables aggressive power saving)

### 4. Browser Tab Throttling

**Risk:**
- Chromium browsers throttle inactive tabs to ~1 Hz
- Sensors may pause or reduce sample rate

**Best Practice:**
- Keep app tab as active/foreground tab
- Close other browser tabs before recording
- Don't open new tabs during session

## 📱 Pre-Recording Checklist

### Phone Setup
- [ ] **Charge phone to 100%** (or keep plugged in)
- [ ] **Disable auto-lock/sleep**: Set to "Never" in phone settings
- [ ] **Increase screen brightness**: Prevents accidental lock triggers
- [ ] **Enable Airplane Mode with WiFi** (optional): Reduces interruptions, keeps local WiFi
- [ ] **Disable notification sounds**: Prevents distraction
- [ ] **Close all other browser tabs**
- [ ] **Turn off battery saver mode**

### App Setup
- [ ] **Verify wake lock**: Check console for "✅ Wake lock acquired"
- [ ] **Check calibration**: Ensure phone is calibrated in boat position
- [ ] **Verify demo mode is OFF**: Top banner should not be visible
- [ ] **Test sensor access**: Check settings panel for real-time sensor readings
- [ ] **Clear old sessions**: Free up storage space if needed

### Physical Setup
- [ ] **Secure phone mount**: Phone should not move during rowing
- [ ] **Screen visible**: Position where coxswain can see it
- [ ] **Waterproof case**: Protect phone from splash/rain
- [ ] **Test mount stability**: Shake test before launch
- [ ] **Verify screen orientation**: "Coxswain" mode in settings if needed

## 🚣 During Recording

### Start Recording
1. **Open app and ensure it's loaded**
2. **Wait for "Wake lock acquired" in console** (if visible)
3. **Press ▶ Start button**
4. **Verify "REC" indicator** in header
5. **Check sample count is incrementing**

### While Recording
- ✅ **DO**: Keep app visible and in foreground
- ✅ **DO**: Keep screen on throughout session
- ✅ **DO**: Monitor metrics to verify data is flowing
- ❌ **DON'T**: Switch apps or tabs
- ❌ **DON'T**: Press power button (unless emergency)
- ❌ **DON'T**: Accept calls (will interrupt recording)
- ❌ **DON'T**: Pull down notification shade

### Monitor Console (if accessible via remote debugging)
- Watch for "⚠️ App went to background" warnings
- Verify no repeated "Wake lock released" messages
- Check that sample counts are incrementing steadily

### Stop Recording
1. **Press ⏹ Stop button**
2. **Wait for session to save** (should be immediate)
3. **Open Sessions panel** to verify recording is listed
4. **Note the sample count** (should be substantial)

## 📊 Post-Recording Verification

### Data Quality Check
1. **Open Sessions panel**
2. **Verify session statistics:**
   - Duration matches expected time
   - Sample count seems reasonable (e.g., 30 min × 50 Hz = ~90,000 samples)
   - GPS data recorded (if available on water)
   - Stroke count detected (if rowing occurred)

### Export Data
1. **Tap "📤 Share" button** on session
2. **Export `.wrcdata` file**
3. **Transfer to computer for analysis**

### Verify with Python Tools
```bash
cd py_scripts
python visualize_wrcdata.py path/to/session.wrcdata
```

Check the output:
- Timestamps are continuous (no gaps)
- Sample rate is consistent (~50 Hz or higher)
- Accelerometer readings look reasonable (-10 to +10 m/s²)
- Gyroscope readings present (if device supports)

## 🔍 Troubleshooting

### "Sample count not increasing"
- **Check**: Is app in foreground?
- **Check**: Is demo mode accidentally enabled?
- **Check**: Did browser request sensor permissions? (iOS needs explicit permission)
- **Fix**: Stop recording, refresh page, restart

### "Wake lock released" repeatedly
- **Cause**: Browser doesn't support wake lock, or device is forcing sleep
- **Fix**: Keep manually tapping screen every few minutes
- **Workaround**: Use video recording app in background (keeps device awake)

### "App crashed during recording"
- **Cause**: Memory pressure, browser issue
- **Check**: Was another app opened during recording?
- **Check**: Does device have sufficient free RAM?
- **Prevention**: Close all background apps before recording

### "Sensor readings are all zeros"
- **Cause**: Browser denied sensor access
- **Fix** (iOS): Settings → Safari → Motion & Orientation Access → Enable
- **Fix** (Android): Browser should auto-prompt; grant permission

### "GPS not recording"
- **Cause**: Location permission denied, or poor GPS signal
- **Check**: Browser location permission granted
- **Note**: GPS may take 30-60s to acquire signal on water

## 📈 Expected Sample Rates

### IMU Data
- **Demo Mode**: Fixed 50 Hz (testing only)
- **iPhone (Safari)**: ~60 Hz
- **Android (Chrome)**: 50-100 Hz (device dependent)
- **Android (Firefox)**: 50-60 Hz

### GPS Data
- **Typical**: 1 Hz (once per second)
- **High accuracy phones**: Up to 5 Hz

### Storage Usage
| Duration | IMU Samples | File Size (approx) |
|----------|-------------|-------------------|
| 5 min    | 15,000      | ~500 KB           |
| 15 min   | 45,000      | ~1.5 MB           |
| 30 min   | 90,000      | ~3 MB             |
| 60 min   | 180,000     | ~6 MB             |

## 🎯 Success Criteria

After your first water test, you should have:
- ✅ At least one complete recording session
- ✅ Sample count > 10,000 (for a meaningful session)
- ✅ Continuous timestamps with no large gaps
- ✅ Exported `.wrcdata` file that opens in Python tools
- ✅ Realistic accelerometer patterns visible in plots
- ✅ Console logs show no repeated warnings

## 📝 Notes for Future Optimization

### Questions to Answer
1. What actual IMU sample rate did you achieve? (Check Python analysis)
2. Were there any gaps in data collection? (Check timestamp continuity)
3. Did wake lock stay active throughout? (Check console logs)
4. How much battery was consumed? (Note percentage before/after)
5. Were sensor readings noisy or clean? (Visual inspection of plots)

### Data to Collect
- Session duration vs. sample count (to calculate actual Hz)
- Battery drain percentage
- Phone temperature (did it overheat?)
- Any interruptions or app freezes
- Console log screenshots (if accessible)

## 🔗 Related Documentation
- [Binary Data Format](BINARY_STORAGE_DESIGN.md)
- [Phone Calibration Guide](PHONE_CALIBRATION_GUIDE.md)
- [Python Analysis Tools](../py_scripts/README.md)
- [Session Management](SESSION_USER_GUIDE.md)

---

**Good luck with your water test! 🚣‍♂️**

Keep the app visible and in foreground, and you should get clean, continuous data for analysis.

