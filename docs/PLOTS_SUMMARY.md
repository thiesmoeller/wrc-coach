# Rowing Plots - Quick Reference

## ✅ Implemented Visualizations

### 1. 🎯 Polar Plot (Stroke Cycle Analysis)

```
         Catch (0°)
            ▲
            │
            │  Blue = Drive
      ◄─────┼─────►
            │  Purple = Recovery  
            │
            ▼
        Finish (120°)
```

**Purpose:** 360° visualization of rowing stroke

**Shows:**
- **Drive Phase** (Blue): 0° → ~120° (target 33%)
- **Recovery Phase** (Purple): 120° → 360° (target 67%)
- **Acceleration** = Distance from center
- **Ideal Pattern** (Green dashed): Optimal reference

**How to Optimize:**

✅ **a) Perfect 1:3 Ratio**
- Blue section: ~120° (33% of cycle)
- Purple section: ~240° (67% of cycle)
- Match the green dashed ideal pattern

✅ **b) Minimize Recovery Deceleration**
- Purple line should stay **close to center**
- Small radius = low deceleration forces
- Large purple spikes = wasted energy

**Settings:**
- Historical Strokes: 0-5 (show past strokes)
- Trail Opacity: 10-80% (fading effect)

---

### 2. ⚖️ Stability Plot (Boat Roll)

```
Port (up)  ────────────────  
              Zero Line        ← Perfect stability
Starboard  ────────────────
(down)     
           Catch → Finish → Catch
           0°      120°     360°
```

**Purpose:** Monitor boat balance through stroke cycle

**Shows:**
- **X-axis**: Stroke position (0° = Catch, 360° = Catch)
- **Y-axis**: Roll angle
  - Negative (up) = Port lean
  - Zero = Perfect level ⭐
  - Positive (down) = Starboard lean
- **Purple line**: Roll trace
- **Red fill**: Port lean
- **Green fill**: Starboard lean

**Perfect Stability = Horizontal Line at Zero**

**How to Optimize:**

✅ **Minimize Roll Deviation**
- Line should stay close to zero (±2°)
- Horizontal = stable boat
- Oscillations = balance issues

**Common Problems:**

| Pattern | Issue | Fix |
|---------|-------|-----|
| Big dip during drive | Uneven power | Balance port/starboard pressure |
| Spike at catch (0°) | Aggressive entry | Softer, synchronized catch |
| Wavy recovery | Poor sync | Rhythm drills, timing |
| Constant lean | Rigging/weight | Adjust setup, crew positions |

---

## 🎨 Visual Guide

### Polar Plot Colors
- 🔵 **Blue** = Drive (power application)
- 🟣 **Purple** = Recovery (return to catch)  
- 🟢 **Green Dashed** = Ideal pattern (33% drive)
- ⚫ **Gray Grid** = Acceleration magnitude reference

### Stability Plot Colors
- 🟣 **Purple Line** = Roll angle over cycle
- 🔴 **Red Fill** = Port lean (problematic)
- 🟢 **Green Fill** = Starboard lean (problematic)
- ⚫ **Black Line** = Zero (perfect stability)

---

## 📊 Quick Performance Check

### ✅ Good Technique (What to See)

**Polar Plot:**
```
✓ Blue section: ~120° (1/3 of circle)
✓ Purple section: ~240° (2/3 of circle)
✓ Blue line extends far (strong drive)
✓ Purple line stays near center (minimal decel)
✓ Pattern matches green dashed ideal
✓ Historical strokes aligned (consistent)
```

**Stability Plot:**
```
✓ Line near zero throughout cycle
✓ Roll < ±5° total
✓ Minimal spike at catch (0°)
✓ Smooth, no oscillations
✓ Symmetrical (balanced port/starboard)
```

### ⚠️ Poor Technique (Warning Signs)

**Polar Plot:**
```
✗ Blue section > 150° (rushed recovery)
✗ Blue section < 90° (slow drive)
✗ Large purple spikes (excessive decel)
✗ Erratic pattern (inconsistent technique)
✗ Historical strokes misaligned (drift)
```

**Stability Plot:**
```
✗ Large roll (> ±10°)
✗ Consistent lean one direction
✗ Wavy line (poor synchronization)
✗ Spikes at catch or finish
✗ Asymmetric port/starboard
```

---

## 🔧 Settings & Controls

### Polar Plot Settings
```
⚙️ Settings → Visualization
├── Historical Strokes: 0-5
│   └── Shows fading trails of past strokes
└── Trail Opacity: 10-80%
    └── Controls fade intensity
```

### Both Plots
```
⚙️ Settings → Stroke Detection
├── Catch Threshold: 0.3-1.2 m/s²
│   └── Affects stroke angle calculation
└── Finish Threshold: -0.8 to -0.1 m/s²
    └── Affects drive/recovery split
```

---

## 🎯 Performance Goals

### Drive-to-Recovery Ratio

| Ratio | Drive % | Angle | Use Case |
|-------|---------|-------|----------|
| 1:3 | 33% | 120° | ⭐ **Optimal** - Steady state |
| 1:2.5 | 29% | 105° | Light pressure |
| 1:2 | 33% | 120° | Training pace |
| 1:1.8 | 36% | 130° | Racing pace |
| 1:1.5 | 40% | 144° | Sprint finish |

**Target: 1:3 to 1:2 for most rowing** (Blue = 105-126°)

### Stability Targets

| Metric | Excellent | Good | Needs Work |
|--------|-----------|------|------------|
| Max Roll | < 2° | < 5° | > 5° |
| Catch Spike | < 1° | < 3° | > 3° |
| Recovery Osc. | None | Minimal | Wavy |
| Symmetry | Perfect | Balanced | One-sided |

---

## 🚀 How to Use

### 1. Start Session
```
1. Enable Demo Mode (for testing without sensors)
2. Click "Start Session"
3. Watch plots update in real-time
```

### 2. Analyze Current Stroke
```
Polar Plot:
- Check drive angle (should be ~120°)
- Check recovery deceleration (small purple)

Stability Plot:
- Check roll magnitude (should be near zero)
- Look for spikes or oscillations
```

### 3. Review Historical Strokes
```
Polar Plot:
- Enable Historical Strokes (1-5)
- Compare current to past strokes
- Look for consistency or drift
```

### 4. Make Adjustments
```
Based on plots:
- Adjust stroke ratio (drive vs recovery timing)
- Reduce deceleration forces (smoother recovery)
- Fix balance issues (crew sync, rigging)
- Maintain consistency (compare to history)
```

---

## 📱 Demo Mode Testing

Perfect for learning the plots without sensors:

```bash
1. Press 'S' → Settings
2. Enable "Demo Mode (25 SPM)"
3. Press ESC → Close
4. Click "Start Session"
5. Observe:
   ✓ Polar: 35% drive ratio (126°)
   ✓ Stability: Simulated roll
   ✓ Real-time updates
```

---

## 🎓 Interpretation Guide

### Reading the Polar Plot

**Q: Why is my blue section too large?**
- A: Rushing recovery (drive > 40%)
- Fix: Slow hands away, controlled slide

**Q: Why do I see large purple spikes?**
- A: Excessive recovery deceleration
- Fix: Smooth recovery, no jerky movements

**Q: What's the green dashed line?**
- A: Ideal pattern reference (33% drive, smooth curves)

### Reading the Stability Plot

**Q: Why is the line wavy?**
- A: Poor crew synchronization
- Fix: Timing drills, rhythm work

**Q: Why constant lean to one side?**
- A: Rigging issue or weight imbalance
- Fix: Check rigging, adjust crew positions

**Q: Why spike at catch (0°)?**
- A: Aggressive or uneven catch
- Fix: Softer entries, focus on symmetry

---

## 📈 Success Metrics

Track your improvement:

### Week 1: Baseline
- [ ] Record current patterns
- [ ] Identify issues (ratio, decel, roll)
- [ ] Set specific goals

### Week 2-4: Refinement
- [ ] Drive ratio: Move toward 33%
- [ ] Recovery decel: Reduce by 20%
- [ ] Roll: Reduce max by 50%

### Week 5+: Consistency
- [ ] Historical strokes align
- [ ] Minimal session-to-session variation
- [ ] Both plots show optimal patterns

---

## 🔍 Quick Diagnostics

**If plots look erratic:**
1. Check phone mounting (secure?)
2. Verify settings (phone orientation correct?)
3. Wait for filters to settle (first 10-20 strokes)
4. Ensure demo mode on/off as intended

**If no data shows:**
1. Session running? (green recording indicator)
2. Enough samples? (need 10+ per stroke)
3. Check sample count in metrics bar

---

## ✨ Summary

**Polar Plot** = Stroke power and timing optimization
- Achieve 1:3 drive-to-recovery ratio
- Minimize recovery deceleration

**Stability Plot** = Boat balance optimization  
- Minimize roll deviation from zero
- Identify and fix balance issues

**Use together** for comprehensive technique analysis! 🚣‍♂️

---

**Pro Tip:** Start each session with demo mode to verify plots work, then switch to real sensors for actual rowing analysis.

