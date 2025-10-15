# Demo Mode Testing & Debugging

## Problem Solved

**Issue:** Demo mode was showing 63-74% drive ratio, which is completely unrealistic (optimal is 33%, max reasonable is ~45%).

**Root Cause:** The filter chain (band-pass + low-pass) significantly alters the signal timing and magnitude. We were generating 35-40% drive in raw data, but it was being detected differently after filtering.

## Solution

Created a standalone test program (`test_stroke_simulation.ts`) to debug the data generation and filtering pipeline without running the web app.

## Test Tool Usage

```bash
# Run the standalone test
npx tsx test_stroke_simulation.ts
```

### What It Does

1. **Generates synthetic IMU data** (10 seconds @ 25 SPM)
2. **Applies the filter chain** (band-pass → low-pass)
3. **Runs stroke detection** algorithm
4. **Reports results:**
   - Detected strokes with drive %
   - Signal statistics (min/max/mean)
   - Threshold crossing analysis
   - Sample-by-sample data for first 2 seconds

### Key Findings

#### Filter Effects
- **Band-pass filter (0.3-1.2 Hz)**: Removes DC bias, smooths signal
- **Low-pass filter (alpha=0.85)**: Further smoothing, introduces lag
- **Combined effect**: Shifts timing and reduces magnitude

#### Compensation Strategy
- **Raw data**: Generate 50% drive ratio with 3.2 m/s² peak
- **After filtering**: Detected as ~38-40% drive
- **Result**: Realistic demonstration of slightly rushed recovery

### Current Demo Mode Parameters

```typescript
// Synthetic data generation
const driveRatio = 0.50;  // Raw data drive ratio
const peakAccel = 3.2;     // m/s² peak during drive
const peakDecel = -1.0;    // m/s² initial recovery decel

// Detection thresholds
const catchThreshold = 0.6;   // m/s²
const finishThreshold = -0.3; // m/s²
```

### Test Results

```
Stroke 2-4: 38% drive  ✓ (target: 38-40%)
Stroke Rate: 25 SPM    ✓
Drive time: 0.92s      ✓
Recovery time: 1.48s   ✓
Total: 2.4s            ✓
```

**Note:** First stroke shows 100% drive (filter settling) - this is expected and ignored.

## What the Demo Mode Demonstrates

### Technique Pattern: Slightly Rushed Recovery

**Drive % : 38-40%** (Optimal is 33%)

This demonstrates a common technique fault:
- Recovery is too short
- Rushing back to the catch
- Creates "check" (backward boat motion)
- Wastes energy

### Visual Indicators

**On the plot you should see:**
```
Accel
  ▲
  │   ╱╲         ← Strong drive (good)
  │  ╱  ╲
  ├─────╲─╲      ← Drive ends too late
  │       ╲╲     ← Rushed recovery (too much decel)
  │        ╲
  └──────────► Time
```

**Compared to ideal (green dashed line):**
- Drive phase: Similar shape ✓
- Recovery phase: Steeper, more deceleration ✗

## Debugging Tips

### If drive % seems wrong:

1. **Run the test tool:**
   ```bash
   npx tsx test_stroke_simulation.ts
   ```

2. **Check signal statistics:**
   - Are threshold crossings reasonable? (~25-40% for catch, ~30-45% for finish)
   - Is filtered signal magnitude sufficient? (peak >1.0 m/s²)

3. **Inspect first 2 seconds of data:**
   - Does the drive phase clearly cross catch threshold?
   - Does recovery clearly cross finish threshold?

4. **Adjust if needed:**
   - Increase peak magnitude if not crossing thresholds
   - Adjust drive ratio if detected % is wrong
   - Remember: Raw ratio ≠ Detected ratio (due to filtering)

### Common Issues

**Issue:** No strokes detected
- **Cause:** Filtered signal doesn't cross thresholds
- **Fix:** Increase raw signal magnitude

**Issue:** 100% drive on all strokes
- **Cause:** Never crossing finish threshold
- **Fix:** Increase recovery deceleration magnitude

**Issue:** Wrong drive %
- **Cause:** Filter lag shifts timing
- **Fix:** Adjust raw drive ratio to compensate

## Filter Parameters

### Band-Pass Filter
```typescript
lowCutoff: 0.3 Hz   // Remove DC and slow drift
highCutoff: 1.2 Hz  // Remove high-frequency noise
sampleRate: 50 Hz   // IMU sample rate
```

**Effect:** Isolates rowing stroke frequency (~0.4-0.8 Hz for 25-48 SPM)

### Low-Pass Filter
```typescript
alpha: 0.85  // Smoothing factor (higher = more smoothing)
```

**Effect:** Further noise reduction, but introduces lag

### Detection Thresholds
```typescript
catchThreshold: 0.6 m/s²    // Drive starts when exceeding this
finishThreshold: -0.3 m/s²  // Recovery starts when below this
```

**Tuning:** Adjust in Settings if stroke detection seems off for your rowing style

## Summary

✅ **Problem:** Unrealistic 74% drive in demo mode  
✅ **Solution:** Compensate for filter effects in synthetic data  
✅ **Result:** Realistic 38-40% drive demonstration  
✅ **Tool:** `test_stroke_simulation.ts` for debugging  

**Demo mode now shows a realistic rowing pattern with slightly rushed recovery, perfect for demonstrating the app's analysis capabilities!** 🚣‍♂️

