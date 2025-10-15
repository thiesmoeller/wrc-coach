# Rectangular Acceleration Plot - User Guide

## Overview

The stroke cycle plot has been updated to use a **rectangular/Cartesian layout** for easier analysis of acceleration patterns throughout the rowing stroke.

## Plot Layout

```
Acceleration (m/s²)
       ▲
   +3  │     ╱╲         ← Peak drive acceleration
       │    ╱  ╲
   +2  │   ╱    ╲
       │  ╱      ╲
   +1  │ ╱        ╲
       │╱__________╲____  ← Zero line (no acceleration)
    0  ├─────────────╲──────────►
       │              ╲    ╱     Stroke Cycle
   -1  │               ╲  ╱      (Catch → Finish → Catch)
       │                ╲╱
   -2  │                         ← Recovery deceleration
       │
    Catch (0°)    Finish (~120°)    Catch (360°)
```

## What You See

### X-Axis: Stroke Cycle (Time)
- **0°** = Catch (blade enters water)
- **~120°** = Finish (blade exits, 33% of cycle for optimal 1:3 ratio)
- **360°** = Return to catch

### Y-Axis: Acceleration (m/s²)
- **Positive (+)** = Acceleration (pushing/driving)
- **Zero (0)** = Constant velocity (no acceleration)
- **Negative (-)** = Deceleration (braking)

### Colors & Fills
- 🔵 **Blue line & fill** = Acceleration (above zero line)
- 🟣 **Purple fill** = Deceleration (below zero line)
- 🟢 **Green dashed** = Ideal pattern reference
- ⚫ **Black line** = Zero acceleration (no force)

## How to Read the Plot

### ✅ Good Technique Pattern

```
   Accel
     ▲
     │    ╱──╲           ← Smooth, strong drive peak
     │   ╱    ╲
     │  ╱      ╲
     ├─╱────────╲───╲─  ← Long, flat recovery (minimal decel)
     │            ╲─╱
     │
     └──────────────────► Time
   Catch    Finish    Catch
   (0°)     (120°)    (360°)
```

**Characteristics:**
- Sharp rise at catch (0°)
- Peak acceleration ~2-3 m/s²
- Drive ends at ~120° (1/3 of stroke)
- Recovery deceleration < 1 m/s²
- Smooth curves, no spikes

### ⚠️ Poor Technique Patterns

#### Problem 1: Rushed Recovery (Drive > 40%)
```
   Accel
     ▲
     │    ╱────╲         ← Drive too long
     │   ╱      ╲
     ├──╱────────╲──     ← Recovery too short
     │            ╲╲
     │             ╲╲__  ← Sharp deceleration
     └──────────────────► Time
```
**Issue:** Drive extends beyond 150°  
**Fix:** Faster hands away, slower recovery

#### Problem 2: Excessive Recovery Deceleration
```
   Accel
     ▲
     │    ╱╲
     │   ╱  ╲
     ├──╱────╲───────    ← Zero line
     │         │
     │         │╲        ← Large negative spike
     │         ╰─╲___
     └──────────────────► Time
```
**Issue:** Large purple area (high deceleration)  
**Fix:** Smoother recovery, no jerky movements

#### Problem 3: Weak Drive
```
   Accel
     ▲
     │     ╱╲            ← Low peak
     │    ╱  ╲
     ├───╱────╲─────
     │
     │
     └──────────────────► Time
```
**Issue:** Peak acceleration < 1.5 m/s²  
**Fix:** Stronger leg drive, better connection

## Performance Goals

### Drive-to-Recovery Ratio

| Target | Drive Angle | Drive % | Recovery Angle | Use Case |
|--------|-------------|---------|----------------|----------|
| **1:3** | 0° → 120° | 33% | 120° → 360° | ⭐ Optimal steady state |
| 1:2.5 | 0° → 105° | 29% | 105° → 360° | Light pressure |
| 1:2 | 0° → 120° | 33% | 120° → 360° | Training pace |
| 1:1.8 | 0° → 130° | 36% | 130° → 360° | Racing pace |

### Acceleration Targets

| Phase | Metric | Excellent | Good | Needs Work |
|-------|--------|-----------|------|------------|
| **Drive** | Peak accel | 2.5-3.5 m/s² | 1.5-2.5 m/s² | < 1.5 m/s² |
| **Drive** | Duration | 120° (33%) | 105-144° | > 144° |
| **Recovery** | Max decel | < 0.5 m/s² | < 1.0 m/s² | > 1.0 m/s² |
| **Recovery** | Duration | 240° (67%) | 216-255° | < 216° |

## Optimization Strategies

### a) Perfect 1:3 Drive-to-Recovery Ratio

**How to Measure:**
1. Look where blue area ends (drive phase)
2. Should be at ~1/3 across the x-axis (120° mark)
3. Purple area should span remaining 2/3

**If Drive Too Long (>150°):**
- Rushing recovery
- Creates boat check (backward motion)
- **Fix:** 
  - Quick hands away after finish
  - Controlled slide return
  - Pause at catch

**If Drive Too Short (<90°):**
- Slow power application
- Missing boat momentum
- **Fix:**
  - Sharper catch
  - Faster leg drive
  - Accelerate through drive

### b) Minimize Recovery Deceleration

**How to Measure:**
1. Look at purple area below zero line
2. Should be small and shallow
3. Compare to ideal green dashed line

**Target:** Purple area ≤ 30% of blue area

**To Reduce Deceleration:**
1. **Smooth hands away** (no rushing)
2. **Body swing before slide** (proper sequencing)
3. **Gradual slide acceleration** (no shooting)
4. **Maintain body angle** (stable core)

**Visual Check:**
- Ideal: Thin purple strip near zero
- Problem: Deep purple dips below -1 m/s²

## Using Historical Strokes

Enable in Settings → Visualization:
- **Historical Strokes**: 0-5 (number of past strokes shown)
- **Trail Opacity**: 10-80% (fade intensity)

**Benefits:**
- Compare current vs. previous strokes
- Identify consistency or drift
- Track improvements over session

**What to Look For:**
- Aligned patterns = consistent technique
- Diverging patterns = fatigue or drift
- Increasing deceleration = efficiency loss

## Green Dashed Ideal Pattern

The ideal reference line shows:
- **Drive (0-120°):** Smooth sinusoidal acceleration
  - Peak: 80% of your max
  - Gradual rise and fall
  
- **Recovery (120-360°):** Minimal deceleration
  - Peak decel: 30% of max accel
  - Very shallow curve

**Goal:** Match your pattern to the ideal
- Blue area shape similar to ideal drive
- Purple area smaller than ideal recovery

## Practical Analysis Examples

### Example 1: Elite Rower
```
Pattern: Sharp peak at 60°, drive ends at 115°, minimal recovery decel
Analysis: ✅ Excellent 1:3 ratio, strong drive, smooth recovery
Result: Fast splits, efficient technique
```

### Example 2: Novice Rower
```
Pattern: Low broad peak, drive extends to 180°, large recovery decel
Analysis: ⚠️ Weak drive, rushed recovery, inefficient
Actions: Focus on leg drive power, slow down recovery
```

### Example 3: Fatigued Rower
```
Pattern: Historical strokes show increasing deceleration over time
Analysis: ⚠️ Technique degrading, efficiency dropping
Actions: Take break, refocus on fundamentals
```

## Settings That Affect Display

### Stroke Detection
- **Catch Threshold** (0.3-1.2 m/s²): Affects where drive starts
- **Finish Threshold** (-0.8 to -0.1 m/s²): Affects where drive ends

Adjust if:
- Drive phase seems too short/long
- Catch/finish markers misaligned

### Visualization
- **Historical Strokes** (0-5): Number of fading trails
- **Trail Opacity** (10-80%): How visible old strokes are

## Demo Mode Testing

Perfect for learning to read the plot:

```bash
1. Settings → Enable "Demo Mode (25 SPM)"
2. Start Session
3. Observe ideal pattern:
   - Drive: 0° → 126° (35%)
   - Peak accel: ~2.0 m/s²
   - Recovery decel: ~-0.8 m/s²
   - Smooth sinusoidal curves
```

## Key Takeaways

### Quick Analysis Checklist

1. **Drive Duration:** Does blue end at ~120°? ✓
2. **Drive Power:** Is peak > 1.5 m/s²? ✓
3. **Recovery Ratio:** Is purple area 2x longer than blue? ✓
4. **Deceleration:** Is purple depth < 1.0 m/s²? ✓
5. **Smoothness:** Are curves smooth, no spikes? ✓
6. **Consistency:** Do historical strokes align? ✓

### Performance Optimization Priority

1. **First:** Get drive ratio right (1:3)
2. **Second:** Reduce recovery deceleration
3. **Third:** Increase drive power
4. **Fourth:** Maintain consistency

### Remember

- **Acceleration = Force application**
- **Deceleration = Wasted energy**
- **1:3 ratio = Optimal boat run**
- **Smooth curves = Good technique**

---

## Comparison: Rectangular vs Polar Plot

### Rectangular (Current)
✅ Easier to read  
✅ Clear time progression  
✅ Obvious acceleration values  
✅ Direct ratio visualization  

### Polar (Previous)
- More artistic/visual
- Radial symmetry
- Harder to judge precise values
- Better for experienced users

**The rectangular plot makes it easier to:**
- Measure exact acceleration values
- See precise timing of phases
- Compare to ideal pattern
- Identify specific technique issues

---

**Happy Rowing! Use this plot to achieve smooth, powerful, efficient strokes! 🚣‍♂️**

