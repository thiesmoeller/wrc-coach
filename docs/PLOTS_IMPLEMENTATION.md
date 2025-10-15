# Rowing Performance Plots - Implementation Guide

## Overview

Two powerful visualization tools have been implemented to help optimize rowing performance:

1. **Polar Plot** - 360° stroke cycle analysis
2. **Stability Plot** - Boat roll monitoring

## 1. Polar Plot (Stroke Cycle Analysis)

### Purpose
Visualize the complete rowing stroke as a polar (circular) plot to analyze:
- **Drive-to-Recovery Ratio** - Target: 1:3 ratio (33% drive, 67% recovery)
- **Deceleration Forces** - Minimize negative acceleration during recovery
- **Stroke Consistency** - Compare current vs. historical strokes

### How It Works

#### Polar Coordinates
- **Angle (0-360°)**: Position in stroke cycle
  - 0° = Catch (blade enters water)
  - ~120° = Finish (blade exits water) for optimal 33% drive
  - 360° = Back to catch
  
- **Radius**: Acceleration magnitude
  - Larger radius = Stronger acceleration/deceleration
  - Drive phase: Positive surge (blue)
  - Recovery phase: Negative surge (purple)

#### Visual Elements

**Grid:**
- Concentric circles show acceleration magnitude
- Cross lines mark cardinal directions
- Labels: "Catch" (top), "Finish" (bottom)

**Current Stroke:**
- **Blue line**: Drive phase (acceleration)
- **Purple line**: Recovery phase (deceleration)
- Thick line (4px) for visibility from distance

**Historical Strokes:**
- Fading trails of previous strokes
- Opacity controlled by `trailOpacity` setting (10-80%)
- Number of strokes shown: `historyStrokes` setting (0-5)
- Helps identify consistency and technique drift

**Ideal Pattern (Green Dashed):**
- Shows optimal stroke pattern
- 33% drive (120°), 67% recovery
- Smooth curves with minimal recovery deceleration

### Performance Optimization Guide

#### a) Achieve 1:3 Drive-to-Recovery Ratio

**What to Look For:**
- Drive phase should span ~120° (0° to 120°)
- Recovery phase should span ~240° (120° to 360°)
- This creates the optimal 1:2 to 1:3 ratio

**If Your Pattern Shows:**
- **Too much drive (>150°)**: Rushing the recovery
  - Problem: Creates "check" (backward boat motion)
  - Fix: Slow down hands-away, controlled slide return
  
- **Too little drive (<90°)**: Slow power application
  - Problem: Missing boat momentum
  - Fix: Sharp catch, accelerate through the drive

**Visual Indicator:**
- Compare your pattern to the green dashed ideal
- Drive phase should match the ideal's angular range

#### b) Minimize Recovery Deceleration

**What to Look For:**
- Recovery phase (purple line) should have **small radius**
- Ideal: Purple line stays close to center
- Bad: Large purple spikes mean excessive deceleration

**Why It Matters:**
- Recovery deceleration slows the boat
- Creates negative work (wasting energy)
- Disrupts boat run and rhythm

**How to Improve:**
- **Smooth hands away**: No jerky movements
- **Controlled slide return**: Gradual acceleration toward catch
- **Maintain body angle**: Don't shoot the slide
- **Timing**: Body-arms-slide sequencing

**Visual Indicator:**
- Purple line should be ~30% of blue line amplitude
- Smooth curves, no sharp spikes
- Compare to ideal pattern (green dashed)

### Settings That Affect Display

```typescript
// In Settings Panel
historyStrokes: 0-5     // Number of historical strokes shown
trailOpacity: 10-80%    // Opacity of historical trails
```

## 2. Stability Plot (Boat Roll)

### Purpose
Monitor boat stability throughout the stroke cycle to:
- Identify balance issues
- Detect uneven oar work
- Optimize crew synchronization
- Minimize wasted energy on lateral motion

### How It Works

#### Horizontal Timeline
- **X-axis**: Stroke angle (0° to 360°)
  - 0° = Catch
  - ~120° = Finish (for 33% drive)
  - 360° = Return to catch (continuous loop)

- **Y-axis**: Roll angle (degrees)
  - **Negative (up)**: Port side down
  - **Zero (center)**: Perfect level
  - **Positive (down)**: Starboard side down

#### Visual Elements

**Zero Line (Black):**
- Horizontal line at center
- Represents perfect stability
- Goal: Keep roll trace close to this line

**Roll Trace (Purple):**
- Thick line (4px) showing roll over cycle
- Continuous from catch to catch
- Closes the loop for seamless visualization

**Colored Fills:**
- **Red area (above zero)**: Port lean
- **Green area (below zero)**: Starboard lean
- Opacity: 20% for clarity

**Grid:**
- Horizontal lines: Roll magnitude reference
- Vertical lines: Stroke phase markers (catch, finish, etc.)
- Labels: "Port" (left), "Starboard" (right)

### Performance Optimization Guide

**Perfect Stability = Horizontal Line**
- Roll trace should be as flat as possible
- Minimal deviation from zero line

**Common Issues:**

1. **Large Roll During Drive**
   - **Pattern**: Big dip during 0-120° phase
   - **Cause**: Uneven oar pressure, crew imbalance
   - **Fix**: Equal port/starboard power, synchronize catch timing

2. **Roll Spike at Catch**
   - **Pattern**: Sharp deviation at 0°
   - **Cause**: Uneven catch, aggressive entry on one side
   - **Fix**: Softer catches, focus on symmetry

3. **Recovery Roll**
   - **Pattern**: Oscillation during 120-360° phase
   - **Cause**: Body movement, rushed recovery
   - **Fix**: Controlled recovery, minimize body swing

4. **Consistent Lean (One Direction)**
   - **Pattern**: Line consistently above or below zero
   - **Cause**: Rigging issue, crew weight distribution
   - **Fix**: Adjust rigging, balance crew positions

5. **Oscillating Pattern**
   - **Pattern**: Wavy line, multiple peaks
   - **Cause**: Poor crew synchronization
   - **Fix**: Rhythm drills, focus on catch timing

### How to Use Both Plots Together

#### Comprehensive Stroke Analysis

1. **Check Polar Plot for Power:**
   - Drive-to-recovery ratio
   - Acceleration pattern
   - Consistency across strokes

2. **Check Stability Plot for Efficiency:**
   - Roll magnitude (energy waste)
   - Timing of balance issues
   - Correlation with stroke phases

3. **Cross-Reference:**
   - **Roll spike during drive?** → Check polar plot for uneven power
   - **Excessive recovery deceleration?** → Check stability for balance issues
   - **Inconsistent patterns?** → Compare historical strokes on polar plot

## Technical Implementation

### Files Created
```
src/components/
  ├── PolarPlot.tsx         # Polar plot component
  ├── PolarPlot.css         # Polar plot styles
  ├── StabilityPlot.tsx     # Stability plot component
  └── StabilityPlot.css     # Stability plot styles
```

### Data Flow

```typescript
// In App.tsx, samples are collected:
const sample = {
  t: timestamp,
  strokeAngle: 0-360,      // From StrokeDetector
  surgeHP: number,         // Filtered surge acceleration
  inDrive: boolean,        // Drive vs recovery phase
  roll: number,            // Boat roll angle (degrees)
  // ... other fields
};

// Passed to plots:
<PolarPlot 
  samples={samples}
  historyStrokes={settings.historyStrokes}
  trailOpacity={settings.trailOpacity}
/>

<StabilityPlot samples={samples} />
```

### Key Algorithms

#### Stroke Grouping
```typescript
// Group samples by detecting angle wrap (360° → 0°)
if (lastAngle > 270 && currentAngle < 90) {
  // New stroke detected
  strokes.push(currentStroke);
  currentStroke = [];
}
```

#### Polar Coordinate Conversion
```typescript
// Convert stroke angle and surge to x,y coordinates
const angleRad = (strokeAngle - 90) * Math.PI / 180; // -90 to start at top
const radius = Math.abs(surge) * scale;
const x = centerX + Math.cos(angleRad) * radius;
const y = centerY + Math.sin(angleRad) * radius;
```

#### Continuous Stability Plot
```typescript
// Duplicate catch samples at 360° to close loop
const wrappedStroke = [
  ...sortedStroke,
  ...catchSamples.map(s => ({ angle: 360, roll: s.roll }))
];
// Plot connects smoothly from 360° back to 0°
```

### Canvas Rendering

Both plots use HTML5 Canvas with:
- **High DPI support**: Scales for retina displays
- **Responsive sizing**: Adapts to screen size
- **Smooth animations**: Updates in real-time
- **Performance optimized**: Only redraws on data change

## Mobile Optimizations

Based on `MOBILE_OPTIMIZATIONS.md`:

### Visibility from Distance
- **Line width**: 4px (thick enough for coxswain to see from 2-3m)
- **Historical strokes**: 3.5px
- **Clear colors**: Blue (drive), purple (recovery/roll), green (ideal)

### Compact Legends
- Reduced font size on mobile (0.6rem)
- Minimal text: "Drive", "Recovery", "Port", "Starboard"
- Horizontal layout to save vertical space

### Responsive Canvas Heights
- **Polar plot**: 280px (desktop), 250px (mobile)
- **Stability plot**: 100px (mobile), max 140px (desktop)
- Adapts to screen size automatically

## Usage in Demo Mode

Demo mode (25 SPM simulation) works perfectly with both plots:

1. Enable demo mode in settings
2. Start session
3. Watch plots update in real-time:
   - Polar plot shows 35% drive ratio pattern
   - Stability plot shows simulated roll

Great for:
- Learning to read the plots
- Understanding optimal patterns
- Testing the app without sensors

## Performance Targets

### Optimal Metrics (from Polar Plot)

| Metric | Target | Indicator |
|--------|--------|-----------|
| **Drive Ratio** | 30-35% | Blue section spans 108-126° |
| **Recovery Ratio** | 65-70% | Purple section spans 234-252° |
| **Peak Drive Accel** | 1.5-3.0 m/s² | Blue line radius |
| **Recovery Decel** | < 1.0 m/s² | Purple line stays near center |
| **Pattern Consistency** | Similar shape | Historical trails align |

### Optimal Metrics (from Stability Plot)

| Metric | Target | Indicator |
|--------|--------|-----------|
| **Max Roll** | < 5° | Purple line stays within ±5° |
| **Roll at Catch** | < 2° | Minimal spike at 0° |
| **Roll Symmetry** | Balanced | Equal port/starboard deviation |
| **Steady State** | Horizontal | Line parallel to zero |

## Troubleshooting

### Polar Plot

**Issue: No plot showing**
- Check that session is running
- Verify samples contain `strokeAngle` and `surgeHP`
- Need at least 10 samples per stroke

**Issue: Erratic pattern**
- Normal during warmup (settling filters)
- Check phone mounting (secure, no vibration)
- Verify phone orientation setting

**Issue: Historical strokes not visible**
- Increase `historyStrokes` setting (0-5)
- Increase `trailOpacity` setting (10-80%)

### Stability Plot

**Issue: Roll values seem wrong**
- Check phone orientation setting (rower vs coxswain)
- Ensure phone is level when stationary
- May need calibration (future feature)

**Issue: Discontinuous line**
- Normal at stroke boundaries
- Algorithm handles angle wrapping
- Smooths connection from 360° to 0°

## Future Enhancements

Potential improvements:
- [ ] Overlay multiple sessions for comparison
- [ ] Export plot images
- [ ] Real-time annotations (markers for technique notes)
- [ ] Advanced metrics (work per stroke, efficiency score)
- [ ] Video sync (overlay plots on rowing video)
- [ ] Coach mode (compare to ideal rower profile)

## Summary

These plots provide actionable, real-time feedback for rowing performance:

**Polar Plot:**
- Optimize drive-to-recovery ratio (target 1:3)
- Minimize recovery deceleration forces
- Maintain consistent technique

**Stability Plot:**
- Identify and fix balance issues
- Reduce wasted lateral motion
- Improve crew synchronization

Together, they enable data-driven technique refinement and performance optimization.

---

**Happy Rowing! 🚣‍♂️**

Use these plots to achieve smooth, powerful, and efficient strokes!

