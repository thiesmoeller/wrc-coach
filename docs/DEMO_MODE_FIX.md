# Demo Mode Improvements for Real-World Data Recording

## Problem
User couldn't easily tell if demo mode was active, risking recording simulated data instead of real sensor data on the boat.

## Solution
Added multiple visual indicators to make demo mode status crystal clear:

### 1. **Prominent Warning Banner** (NEW)
- Bright orange/red pulsing banner at top of screen when demo mode is ON
- Shows: "⚠️ DEMO MODE ACTIVE - Using simulated data, not real sensors!"
- Includes **"Switch to Real Sensors"** button for instant disable
- Impossible to miss!

### 2. **Enhanced Settings Panel**
- Demo Mode checkbox now highlights in RED when enabled
- Background pulses red when demo mode is active
- Dynamic help text:
  - **When ON**: "⚠️ Currently using FAKE data! Uncheck this to use real sensors on the boat."
  - **When OFF**: "✓ Using real phone sensors - perfect for on-water recording!"

### 3. **Header Indicator** (existing)
- Status shows "Demo Mode" instead of "Recording" or "Ready"

## How to Disable Demo Mode

### Method 1: Quick Toggle (NEW)
If you see the orange warning banner:
1. Click **"Switch to Real Sensors"** button
2. Demo mode turns off immediately

### Method 2: Settings Panel
1. Click menu button (☰) or press 'S'
2. Scroll to "Data Recording" section
3. Uncheck "Demo Mode (Simulated Data)" checkbox
4. Look for green checkmark: "✓ Using real phone sensors"

### Method 3: Reset All Settings
1. Open Settings (☰ or press 'S')
2. Scroll to bottom
3. Click "🔄 Reset to Defaults"
4. Demo mode will be OFF (default is OFF)

## Verification

**How to confirm you're using REAL sensors:**

✅ **No orange warning banner** at top  
✅ Header says "Ready" or "Recording" (NOT "Demo Mode")  
✅ Settings panel shows: "✓ Using real phone sensors"  
✅ Demo Mode checkbox is UNCHECKED  

**If demo mode is ON, you'll see:**

❌ **Bright orange pulsing banner** at top  
❌ Header says "Demo Mode"  
❌ Settings panel has red highlight  
❌ Demo Mode checkbox is CHECKED  

## Default State

- **Demo Mode defaults to OFF** in fresh installs
- Perfect for real-world data collection
- Only enable for testing/demonstration without boat

## Technical Details

**Files Changed:**
- `src/App.tsx` - Added warning banner
- `src/App.css` - Banner styling with pulse animation
- `src/components/SettingsPanel.tsx` - Enhanced demo mode display
- `src/components/SettingsPanel.css` - Red highlight animation

**How it Works:**
- Settings stored in localStorage under `strokeCoachSettings`
- `demoMode: false` is the default
- Toggle updates immediately (no page refresh needed)
- Banner appears/disappears reactively

## For First Real Boat Use

**Pre-launch Checklist:**
1. ✅ Verify NO orange warning banner
2. ✅ Open Settings and confirm demo mode is UNCHECKED
3. ✅ See "✓ Using real phone sensors" message
4. ✅ Ready to record real data!

**During Recording:**
- If you see the orange banner, STOP immediately
- Click "Switch to Real Sensors"
- Restart your session

This ensures you're collecting actual boat motion, not simulated 25 SPM rowing data!

