# PCA-Based Axis Detection & V3 File Format

## Summary

**Major simplifications in V3:**
1. Replaced manual calibration with **automatic PCA-based axis detection**
2. Removed manual catch/finish threshold configuration - now **fully automatic**
3. Auto-calculate sample rate from timestamps

The phone's IMU orientation and all detection parameters are now automatically determined from the rowing motion data itself.

## Changes Made

### 1. New PCA Axis Detector Module

Created `/src/lib/PCAAxisDetector.ts` and `/analysis-app/src/lib/PCAAxisDetector.ts`:

- **Automatic Axis Detection**: Uses Principal Component Analysis (PCA) on acceleration data to find the boat's bow-stern axis
- **How it works**:
  1. Estimates gravity vector from all samples (median)
  2. Removes gravity to get dynamic acceleration
  3. Filters for significant motion (>1.0 m/s²)
  4. Runs PCA to find principal components
  5. First PC = bow-stern axis (dominant rowing motion)
  6. Second PC = port-starboard axis
  7. Third PC = vertical axis
- **Confidence metric**: Ratio of first to second component variance (tells you how clear the dominant direction is)

### 2. Updated File Format to V3

**PWA (Recording App):**
- `src/lib/data-storage/BinaryDataWriter.ts`: Updated to V3 format
  - Magic string: `WRC_COACH_V3`
  - Header size: 64 bytes (simplified from V2's 128 bytes)
  - Removed: calibration data, calibration samples
  - Structure: `[Header(64B)][IMU Samples][GPS Samples]`

- `src/lib/data-storage/BinaryDataReader.ts`: Updated to support V1, V2, and V3
  - Reads all three versions
  - V2 calibration data is read but ignored

**Analysis App:**
- `analysis-app/src/lib/BinaryDataReader.ts`: Updated to support V1, V2, and V3
  - Detects version from magic string
  - V2 calibration is parsed but ignored (returns `null`)
  - Always uses PCA instead

### 3. Updated DataAnalyzer (Analysis App)

`analysis-app/src/lib/DataAnalyzer.ts`:
- Removed: `ComplementaryFilter`, `transformToBoatFrame`, calibration application
- Added: PCA-based axis detection
- Process:
  1. Detect axes using PCA (`PCAAxisDetector.detectAxes()`)
  2. Estimate gravity
  3. Transform all samples to boat frame using detected axes
  4. Apply band-pass filter
  5. Detect strokes using adaptive detector
- Logs axis detection confidence and explained variance
- Warns if confidence < 60%

### 4. Removed Calibration from PWA

**Data Storage:**
- `src/lib/data-storage/IndexedDBStorage.ts`: Removed `hasCalibrationData` field
- `src/hooks/useSessionStorage.ts`: Removed `calibrationData` from `SessionData` interface

**UI:**
- `src/components/SettingsPanel.tsx`: Removed `CalibrationPanel` import and section
- Removed `motionData` prop (was only used for calibration)
- `src/App.tsx`: Removed `calibrationData` variable and prop passing

**Hooks:**
- `src/hooks/useCalibration.ts`: Still exists but no longer used in app (can be removed later if desired)
- `src/lib/calibration/`: Calibration library still exists (not actively removed)

### 5. Backward Compatibility

**Analysis App** can load:
- ✅ V1 files (legacy, no calibration)
- ✅ V2 files (with calibration - **calibration data is read but ignored**, PCA is used instead)
- ✅ V3 files (PCA-based, no calibration)

**PWA** now writes:
- ✅ V3 files only (PCA-based, no calibration)

## Benefits

1. **Zero Configuration**: No need to calibrate the phone before each session
2. **Arbitrary Phone Orientation**: Works regardless of how the phone is mounted
3. **Robust**: Based on actual motion data, not assumptions about phone mounting
4. **Automatic**: Works out of the box for any recording
5. **Confidence Metric**: Tells you if the rowing motion is clear enough for reliable analysis
6. **Simpler Code**: Removed ~300 lines of calibration-related code
7. **Smaller Files**: V3 files are smaller (no calibration data)
8. **Auto-Calculated Sample Rate**: Sample rate is calculated from actual timestamps, not manually configured

## Theory

During rowing, the boat's primary motion is along the **bow-stern axis**. By analyzing the direction of dominant acceleration variance, PCA automatically finds this axis.

**PCA Steps:**
1. Remove gravity (estimated as median of all samples)
2. Filter for significant motion (magnitude > 1 m/s²)
3. Center data (mean = 0)
4. Compute covariance matrix
5. Find eigenvalues/eigenvectors
6. Sort by eigenvalue (largest = most variance)
7. First eigenvector = bow-stern axis

**Confidence Score:**
- High confidence (>70%): Clear rowing motion, dominant direction
- Medium confidence (60-70%): Good, but some lateral movement
- Low confidence (<60%): Motion is not clearly directional (may not be rowing)

## Testing Recommendations

1. **Test with existing V2 files**: Ensure analysis still works
2. **Record new V3 files**: Verify PCA detects axes correctly
3. **Check confidence scores**: Should be >60% for good rowing data
4. **Various phone orientations**: Test with phone mounted in different ways
5. **Demo mode**: Verify demo mode still works (generates synthetic data)

## Fully Automatic Stroke Detection

**Catch and finish thresholds removed** - the adaptive stroke detector now:
- Automatically calculates thresholds based on signal statistics (90th percentile)
- Finds catch peaks as local maxima above auto-calculated threshold
- Finds finish as minimum acceleration in each catch-to-catch segment
- No manual tuning required!

All threshold parameters have been removed from:
- ❌ Analysis app UI (ParameterPanel)
- ❌ PWA settings (SettingsPanel)
- ❌ File format (V3 doesn't store thresholds)
- ❌ Data storage (IndexedDBStorage)

**Result:** Zero configuration needed for stroke detection!

## Auto-Calculated Sample Rate

The analysis app now **automatically calculates the sample rate** from the timestamps in the recording:

1. Calculates intervals between consecutive samples: `Δt = t[i] - t[i-1]`
2. Averages all intervals: `avg_interval = mean(Δt)`
3. Converts to Hz: `sample_rate = 1000 / avg_interval`
4. Logs the result to console

**Benefits:**
- Accurate even if sample rate varies during recording
- No manual configuration needed
- Works with any recording, regardless of device

**Example output:**
```
Calculated sample rate: 51.3 Hz (avg interval: 19.5 ms)
```

The sample rate control has been **removed** from the Parameter Panel in the analysis-app. A note explains that it's auto-calculated.

## Potential Future Improvements

1. **Remove remaining calibration code**: Delete `useCalibration.ts`, `PhoneCalibration.ts`, `CalibrationPanel.tsx`
2. **Visualize detected axes**: Show user the detected bow-stern direction for debugging
3. **Auto-flip direction**: If surge is mostly negative, flip the bow-stern axis
4. **Use gyroscope**: Incorporate gyro data into axis detection for better results
5. **Adaptive windowing**: Run PCA on sliding windows to handle changing phone orientation during session

## File Format Versions

| Version | Magic String    | Header Size | Calibration | Thresholds | Notes |
|---------|----------------|-------------|-------------|------------|-------|
| V1      | WRC_COACH_V1   | 64 bytes    | No          | Yes (ignored) | Legacy |
| V2      | WRC_COACH_V2   | 128 bytes   | Yes (ignored) | Yes (ignored) | Deprecated |
| V3      | WRC_COACH_V3   | 64 bytes    | No          | No         | Current (fully automatic) |

**V3 Header Structure (64 bytes):**
- Magic string: 16 bytes
- IMU count, GPS count: 8 bytes  
- Session start timestamp: 8 bytes
- Phone orientation, demo mode: 2 bytes
- Reserved: 30 bytes

## Migration Notes

- **No user action required**: Existing V2 files will automatically use PCA instead of calibration
- **Settings**: Calibration section removed from Settings panel
- **Data**: Old sessions with calibration data are preserved but calibration is not used

