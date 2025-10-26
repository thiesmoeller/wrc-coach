# Stroke Detection Fix - Analysis App

## Problem Summary

When loading the first real rowing recording into the analysis app, no strokes were detected.

## Root Cause

The analysis app was **not properly processing the raw IMU data**. It was directly using the raw `ay` acceleration values without:

1. **Applying calibration** - The phone mounting angle corrections were being ignored
2. **Calculating orientation** - No pitch/roll estimation to remove gravity
3. **Removing gravity** - Gravity component was still in the signal
4. **Transforming to boat frame** - Phone axes were not being mapped to boat axes
5. **Accounting for phone orientation** - "rower" vs "coxswain" mounting requires different axis mappings

### Why This Matters

For a phone in "rower" orientation (facing stern):
- The phone's `+ay` axis points toward the bow
- But the rower accelerates **backward** (toward stern) during drive
- So we need to use `-ay` to get positive acceleration during drive
- Additionally, we need to remove the gravity component and apply calibration offsets

### The Raw Data

The `.wrcdata` file stores:
- **Raw IMU samples** (ax, ay, az, gx, gy, gz) - no transformations applied
- **Calibration data** (pitch offset, roll offset) - V2 format only
- **Phone orientation** (rower/coxswain)
- **Session metadata**

This design allows reprocessing with different parameters, but requires proper transformation in the analysis app.

## Solution

Updated the analysis app to match the main PWA's data processing pipeline:

### 1. Updated BinaryDataReader (`analysis-app/src/lib/BinaryDataReader.ts`)
- Now reads and returns calibration data from V2 files
- Added `readCalibration()` method
- Returns calibration in SessionData

### 2. Updated DataAnalyzer (`analysis-app/src/lib/DataAnalyzer.ts`)
- Added `applyCalibration()` function to correct for mounting angles
- Create ComplementaryFilter instance to estimate orientation
- Use `transformToBoatFrame()` to:
  - Remove gravity using estimated orientation
  - Map phone axes to boat axes
  - Apply sign flip for "rower" orientation
- Process **surge** (fore-aft) acceleration instead of raw `ay`

### 3. Updated Types (`analysis-app/src/types.ts`)
- Added `CalibrationData` interface
- Added optional `calibration` field to `SessionData`

### 4. Updated StatisticsPanel (`analysis-app/src/components/StatisticsPanel.tsx`)
- Display calibration status and offsets
- Show pitch/roll offsets and quality metrics

## Data Flow Comparison

### Before (WRONG):
```
Raw ay → Band-pass filter → Stroke detection ❌
```

### After (CORRECT):
```
Raw (ax, ay, az) 
  → Apply calibration (undo mounting angle)
  → Estimate orientation (complementary filter)
  → Transform to boat frame (remove gravity, map axes)
  → Extract surge acceleration
  → Band-pass filter
  → Stroke detection ✓
```

## Testing

Your recording shows:
- **Format**: V2
- **Phone orientation**: rower
- **Calibration**: Present (pitch: 6.79°, roll: -6.79°)
- **Duration**: 378.6 seconds
- **IMU samples**: 22,685 (~60 Hz)

After the fix, the analysis app now:
1. Reads the calibration data
2. Applies the pitch/roll corrections
3. Calculates orientation to remove gravity
4. Transforms to boat frame with proper sign for "rower" orientation
5. Should now detect strokes correctly

## Key Insight

The very low gravity magnitude (0.010 m/s² vs expected 9.8 m/s²) in the calibration suggests the calibration might have been performed while the phone was moving or not properly settled. However, the pitch and roll offsets are reasonable and should help improve stroke detection even if the calibration quality was suboptimal.

## Next Steps

1. Test the analysis app with the real data
2. Verify stroke detection is working
3. Fine-tune thresholds if needed (catchThreshold, finishThreshold)
4. Consider improving calibration procedure in main PWA if needed

## Files Modified

- `analysis-app/src/types.ts` - Added CalibrationData interface
- `analysis-app/src/lib/BinaryDataReader.ts` - Read calibration data
- `analysis-app/src/lib/DataAnalyzer.ts` - Full IMU processing pipeline
- `analysis-app/src/components/StatisticsPanel.tsx` - Display calibration info

