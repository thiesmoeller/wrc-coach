# Phone Mounting Calibration Guide

## Overview

The WRC Coach app requires accurate orientation data to properly analyze rowing technique. Since phones can be mounted at various angles and positions in the boat, a calibration system is essential to compensate for mounting offsets.

## Why Calibration is Needed

### The Problem

When a phone is mounted in a boat:

1. **Mounting Angle Offsets**: The phone may be tilted relative to the boat's true horizontal
   - **Pitch offset**: Forward/backward tilt (affects surge measurement)
   - **Roll offset**: Port/starboard tilt (affects sway and roll angle)
   - **Yaw offset**: Rotation around vertical axis

2. **Position Offsets**: The phone may not be on the boat's centerline
   - **Lateral offset**: Distance from centerline affects roll interpretation
   - **Longitudinal offset**: Less critical for most measurements

### Impact on Measurements

Without calibration:
- **Surge acceleration** gets contaminated by gravity components
- **Roll angles** are incorrectly biased
- **Stroke detection** may fail or be inaccurate
- **Technique analysis** shows misleading patterns

## Calibration System

### Static Calibration (Mounting Orientation)

**When to perform**: After mounting the phone, before rowing

**Procedure**:
1. Place the boat in calm water (or keep it stationary)
2. Ensure rowers are seated and still
3. Start calibration in the app
4. Keep the boat steady for 3-5 seconds
5. App automatically calculates mounting offsets

**What it measures**:
- Uses gravity vector to determine mounting angles
- Pitch offset: `atan2(ay, sqrt(ax² + az²))`
- Roll offset: `atan2(ax, sqrt(ay² + az²))`
- Gravity magnitude for sensor validation

**Accuracy**: Typically < 1° for pitch and roll on a calm day

### Dynamic Calibration (Lateral Position) - Advanced

**When to perform**: During steady-state rowing (optional)

**What it does**:
- Analyzes roll patterns during rowing
- Estimates lateral offset from centerline
- Refines calibration over multiple strokes

**Note**: This is an advanced feature for users who want maximum accuracy when the phone is significantly off-center.

## Calibration Application

### Rotation Correction

The app applies inverse rotations to undo the mounting offset:

```
1. Measure mounting angles: (pitch_offset, roll_offset, yaw_offset)
2. For each sensor reading (ax, ay, az):
   a. Undo pitch rotation around X-axis
   b. Undo roll rotation around Y-axis  
   c. Undo yaw rotation around Z-axis (if available)
3. Result: acceleration in boat reference frame
```

### Boat Reference Frame

After calibration, all measurements are in the boat frame:
- **Surge**: Stern (-) to Bow (+)
- **Sway**: Port (-) to Starboard (+)
- **Heave**: Down (-) to Up (+)

## Using the Calibration System

### Test Script

The `test_stroke_simulation.ts` script demonstrates the full calibration pipeline:

```bash
npx tsx test_stroke_simulation.ts
```

**Test sequence**:
1. Simulates phone mounted with 15° pitch and -8° roll
2. Performs static calibration (150 samples)
3. Validates calibration accuracy
4. Compares detection WITH and WITHOUT calibration

**Expected results**:
- Pitch detection: < 1° error
- Roll detection: < 2° error (may have gimbal effects)
- Surge correction: < 0.1 m/s² error
- Improved stroke detection accuracy

### In the App (Future Implementation)

A calibration mode will be added to the settings panel:

1. **Calibration Button**: Starts 5-second calibration
2. **Progress Indicator**: Shows sample collection
3. **Calibration Status**: Displays detected offsets
4. **Quality Metrics**: Shows calibration confidence
5. **Save/Load**: Persistent calibration storage

## Technical Details

### Rotation Mathematics

**Forward rotation** (applied during mounting):
```
// Pitch rotation (around X-axis)
ay' = ay * cos(pitch) + az * sin(pitch)
az' = -ay * sin(pitch) + az * cos(pitch)

// Roll rotation (around Y-axis)
ax' = ax * cos(roll) - az * sin(roll)
az' = ax * sin(roll) + az * cos(roll)
```

**Inverse rotation** (calibration correction):
```
// Undo pitch (use -pitch)
ay_corrected = ay * cos(-pitch) + az * sin(-pitch)
az_temp = -ay * sin(-pitch) + az * cos(-pitch)

// Undo roll (use -roll)
ax_corrected = ax * cos(-roll) - az_temp * sin(-roll)
az_corrected = ax * sin(-roll) + az_temp * cos(-roll)
```

### Gravity Vector Analysis

At rest, the accelerometer reads only gravity (9.8 m/s²):

- **Level phone**: (0, 0, -9.8)
- **15° forward tilt**: (0, -2.54, -9.46)
- **-8° port tilt**: (1.37, 0, -9.69)

Mounting angles are extracted:
```
pitch_offset = -atan2(ay_avg, sqrt(ax_avg² + az_avg²))
roll_offset = -atan2(ax_avg, sqrt(ay_avg² + az_avg²))
```

The negative sign accounts for the fact that the measured gravity angle is opposite to the rotation that was applied.

## Limitations and Considerations

### Current Limitations

1. **Yaw offset**: Cannot be determined from gravity alone
   - Requires compass or known heading
   - Less critical for most rowing metrics

2. **Dynamic effects**: Calibration assumes static conditions
   - Water motion can introduce errors
   - Use calmest conditions possible

3. **Gimbal lock**: When pitch ≈ 90°, roll becomes undefined
   - Avoid extreme mounting angles
   - Keep phone within ±45° of level

### Best Practices

1. **Mount the phone securely** to avoid vibration
2. **Calibrate in calm conditions** (dock or calm water)
3. **Recalibrate** if phone position changes
4. **Check calibration quality** metrics before rowing
5. **Store calibration** for consistent sessions

## Future Enhancements

### Planned Features

1. **Auto-calibration**: Detect when calibration is needed
2. **Multi-position calibration**: Average multiple orientations
3. **Compass integration**: Add yaw offset calibration
4. **Machine learning**: Refine calibration during rowing
5. **Calibration profiles**: Save different boat/mounting setups

### Advanced Analysis

1. **Lateral offset estimation**: Use roll patterns during steady rowing
2. **Sensor fusion**: Combine GPS and IMU for position
3. **Calibration quality score**: Validate confidence metrics
4. **Automatic correction**: Detect and fix calibration drift

## Summary

The calibration system is essential for accurate rowing analysis. By measuring and compensating for phone mounting offsets, the app provides reliable surge acceleration, roll angles, and stroke detection even when the phone is not perfectly aligned with the boat.

**Key takeaway**: Always calibrate before rowing for best results!

