# Fix Summary - Demo Mode & Calibration Export

## ✅ Both Issues Resolved

### Issue 1: Demo Mode Not Working ✅

**Problem:** Demo mode was broken after adding 45° pitch offset simulation. The large offset made data unusable without calibration.

**Fix:** Reverted demo mode to simulate **level phone mounting** (0° offset).

**File:** `src/hooks/useDeviceMotion.ts`
```typescript
// Now simulates level phone (no offset) for normal demo use
const mountingPitch = 0;  // degrees (level)
const mountingRoll = 0;   // degrees (level)
```

**Result:** Demo mode works perfectly again out-of-the-box! 🎉

---

### Issue 2: Calibration Data Export ✅

**Problem:** Calibration data wasn't saved to `.wrcdata` files, making reprocessing and optimization impossible.

**Fix:** Upgraded binary format to **V2** with full calibration support.

**What's Now Exported:**

1. **Calibration Metadata:**
   - Pitch offset (degrees)
   - Roll offset (degrees)
   - Yaw offset (future)
   - Gravity magnitude
   - Quality metrics (variance)
   - Calibration timestamp

2. **Calibration Samples:**
   - Raw IMU data collected during calibration (150-250 samples)
   - Allows algorithm reprocessing and optimization

**Files Modified:**
- ✅ `src/lib/data-storage/BinaryDataWriter.ts` - Binary format V2
- ✅ `src/lib/calibration/PhoneCalibration.ts` - Export samples method
- ✅ `src/hooks/useCalibration.ts` - Expose samples to app
- ✅ `src/App.tsx` - Include calibration in export

**Export Feedback:**
```
Before: "Exported 1,247 samples"
After:  "Exported 1,247 samples (Calibrated: pitch=45.0°, roll=-3.2°)"
```

---

## Binary Format Upgrade

### V1 → V2 Changes

**Header:**
- Size: 64 → 128 bytes
- Magic: "WRC_COACH_V1" → "WRC_COACH_V2"
- Added: calibrationCount, hasCalibration flag

**New Sections:**
- Calibration data block (64 bytes)
- Calibration samples array (32 bytes × count)

**File Size Impact:**
- Only **~7 KB** larger per session (< 1% increase)
- Worth it for reprocessing capability!

---

## How to Test

### Test Demo Mode
```bash
1. npm run dev
2. Enable Demo Mode (Settings)
3. Start Recording
4. See clean rowing data (25 SPM)
```

### Test Calibration Export
```bash
1. npm run dev
2. Enable Demo Mode
3. Calibrate (Settings → Calibration)
4. Record 10 seconds
5. Stop → Export
6. Check alert message shows calibration info
7. File includes all calibration data
```

---

## Use Cases

### For Users
✨ **Works immediately** - Demo mode functional without calibration  
✨ **Complete exports** - All data saved for later analysis  
✨ **No extra steps** - Automatic inclusion  

### For Developers
🔧 **Reprocessing** - Can apply updated calibration algorithms  
🔧 **Debugging** - Access to raw calibration samples  
🔧 **Optimization** - Test improvements on real data  

### For Researchers
📊 **Complete datasets** - Nothing missing  
📊 **Reproducible** - Exact calibration state preserved  
📊 **Analyzable** - Raw samples for algorithm research  

---

## Summary

| Aspect | Status |
|--------|--------|
| Demo Mode | ✅ Fixed - Works perfectly |
| Calibration Export | ✅ Implemented - V2 format |
| Build | ✅ Success - No errors |
| File Size Impact | ✅ Minimal - <1% increase |
| Documentation | ✅ Complete |

---

## Quick Reference

### Demo Mode Settings
- **Pitch:** 0° (level)
- **Roll:** 0° (level)
- **Stroke Rate:** 25 SPM
- **Motion:** Research-based pattern
- **Works:** Out-of-box, no calibration needed ✅

### Calibration Export
- **Format:** Binary V2
- **Includes:** Offsets, quality, raw samples
- **Size:** +7KB per session
- **Compatible:** V1 files still readable
- **Feedback:** Shows calibration info in export ✅

---

## Build Verification

```bash
$ npm run build
✓ built in 504ms
```

✅ **All systems go!**

---

**Status:** Ready to use  
**Date:** October 15, 2025  
**Version:** 2.0 (Binary V2)  

