# Ready for Real Boat - Pre-Launch Checklist ✓

## Quick Pre-Launch Check (30 seconds)

### 1. ⚠️ Demo Mode Status
Open the app and verify:

- [ ] **NO orange warning banner** at top of screen
- [ ] Header shows "Ready" (NOT "Demo Mode")

If you see orange banner → Click "Switch to Real Sensors" button!

### 2. 📱 Phone Setup
- [ ] Phone fully charged (or charging cable ready)
- [ ] Airplane mode OFF (need GPS!)
- [ ] Screen lock disabled (or set to long timeout)
- [ ] Phone in waterproof case (recommended)

### 3. 🎯 Orientation Setting
- [ ] Open Settings (☰)
- [ ] Set "Phone Orientation" correctly:
  - **Rower (facing stern)** ← Most common
  - Coxswain (facing bow)

### 4. 📊 App State
- [ ] No session currently recording
- [ ] Storage space available (check Sessions panel)

## Detailed Settings Verification

### Open Settings Panel (press 'S' or click ☰)

#### Calibration (Optional for first use)
- Phone calibration can be done later
- Skip for now if just recording data

#### Visualization
- History Strokes: Any value (2 is good default)
- Trail Opacity: Any value (40% is good default)
- ℹ️ These only affect display, not recorded data

#### Stroke Detection
- Catch Threshold: 0.6 m/s² (default)
- Finish Threshold: -0.3 m/s² (default)
- ℹ️ Can tune these later based on real data

#### Data Recording ⭐ IMPORTANT
- [ ] Display Sample Rate: 20 FPS (default is fine)
- [ ] **Demo Mode: UNCHECKED** ← Critical!
- [ ] See message: "✓ Using real phone sensors"
- [ ] Phone Orientation: Set to your position

## On-Water Recording Workflow

### Starting a Session
1. Click **Sessions** button
2. Click **New Session** (green button)
3. Verify you see red "Recording" indicator in header
4. Place phone in secure location in boat
5. Start rowing!

### During Recording
- Keep screen on (prevents GPS sleep)
- Phone should remain stationary in boat
- Displays may not be perfect yet - that's OK!
- Focus on collecting good data

### Ending a Session
1. Click **Stop** button (red)
2. Session auto-saves immediately
3. Repeat for next piece

### Multiple Pieces
- Each piece gets its own session
- No need to export between pieces
- All data saved locally on phone

## After Your Outing

### Export Your Data
1. Click **Sessions**
2. For each session you want:
   - Click **💾 Export**
   - File downloads as `.wrcdata`
3. Save these files to your computer

### Backup Important Sessions
- Copy .wrcdata files to:
  - Computer
  - Cloud storage
  - Multiple locations (important data!)

### Cleanup
- Delete practice/test sessions
- Keep only good data
- Frees up phone storage

## Troubleshooting on Water

### "Orange banner appeared during recording!"
- **Stop immediately**
- Click "Switch to Real Sensors"
- Start new session
- Previous session has demo data (delete it later)

### "GPS not working"
- Check airplane mode is OFF
- Ensure location permission granted
- Wait 30 seconds for GPS lock (initial fix)
- Move away from obstructions

### "Screen keeps turning off"
- Disable auto-lock in phone settings
- Or tap screen periodically
- Consider "Keep Screen On" app

### "App crashed"
- Restart app
- Current recording lost
- Previous sessions still saved
- Start new session

### "Running out of storage"
- Go to Sessions panel
- Delete old/unnecessary sessions
- Export important sessions first
- Each session contains full raw data (large!)

## What Data is Being Collected?

### IMU (Inertial Measurement Unit)
- Accelerometer (ax, ay, az)
- Gyroscope (gx, gy, gz)
- ~50 Hz sampling rate
- Captures boat motion

### GPS
- Position (latitude, longitude)
- Speed over ground
- Heading
- Accuracy estimate
- ~1 Hz sampling rate

### Derived Metrics (calculated in app)
- Stroke rate
- Drive percentage
- Roll angle
- Stroke cycle position

All raw data is saved - analysis can be refined later!

## Post-Recording Analysis

### Viewing Your Data
Use Python scripts in repository:
```bash
python visualize_wrcdata.py your_session.wrcdata
```

### Creating GPS Maps
```bash
python create_gps_map.py your_session.wrcdata
```

## Common First-Time Issues (Expected!)

### ✓ Normal
- Displays look weird/incorrect
- Stroke detection off
- Metrics don't match reality
- Some visual glitches

These are expected! The goal is **data collection**, not perfect display.

### ⚠️ Not Normal (Check Settings)
- Orange demo mode banner showing
- No GPS fix after 2+ minutes
- App immediately crashes on start
- No accelerometer data

## Quick Reference

### Button Layout
```
[☰ Menu]  [WRC Coach]  [● Recording/Ready]

[📊 Sessions] [▶ Start] [⏹ Stop]
```

### Essential Keyboard Shortcuts
- **S** - Open Settings
- **ESC** - Close panels

### Essential Info Locations
- **Demo Mode Status**: Orange banner + Header
- **Recording Status**: Header (red dot when recording)
- **Session List**: Sessions button
- **Settings**: Menu button (☰) or press S

## Final Pre-Launch Checks

Right before launching:

1. ✅ App open and showing "Ready"
2. ✅ No orange warning banner
3. ✅ Phone orientation set correctly
4. ✅ Plenty of storage space
5. ✅ GPS enabled (airplane mode OFF)
6. ✅ Screen timeout disabled
7. ✅ Phone in waterproof case

**You're ready to collect real rowing data! 🚣**

## After Your First Session

Please note:
- What felt right vs what displays showed
- Water conditions (calm/choppy/windy)
- Any unexpected behavior
- Which metrics seemed accurate

This helps tune the algorithms for real boat motion!

---

**Remember**: Focus on collecting data first, perfecting displays second. Good luck on the water! 🌊

