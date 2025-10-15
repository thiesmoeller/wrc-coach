# Calibration UI Flow - Visual Guide

## User Interface Overview

### Location
The calibration panel appears at the **top of the Settings panel**, making it immediately visible and easy to access.

```
Settings Panel
┌─────────────────────────────────────┐
│  ⚙️ Settings              ESC to close │
├─────────────────────────────────────┤
│                                     │
│  📍 Phone Calibration               │  ← HERE!
│  ┌─────────────────────────────┐   │
│  │ Calibration content...       │   │
│  └─────────────────────────────┘   │
│                                     │
│  Visualization                      │
│  ├─ Historical Strokes...           │
│  └─ Trail Opacity...                │
│                                     │
│  Stroke Detection                   │
│  └─ Thresholds...                   │
│                                     │
└─────────────────────────────────────┘
```

## State 1: Not Calibrated

### Visual Appearance
```
┌───────────────────────────────────────┐
│ 📍 Phone Calibration                  │
├───────────────────────────────────────┤
│ Calibrate to compensate for phone    │
│ mounting angle. Keep the boat steady  │
│ for 5 seconds.                        │
│                                       │
│ ⚠️ Not calibrated                     │
│                                       │
│ For accurate measurements, calibrate  │
│ the phone mounting position.          │
│                                       │
│  ┌─────────────────────────┐         │
│  │ 🎯 Start Calibration    │         │
│  └─────────────────────────┘         │
│                                       │
│ 💡 Tips:                              │
│ • Calibrate in calm water or at dock │
│ • Keep the boat as still as possible │
│ • Recalibrate if phone position      │
│   changes                             │
│ • Better quality = more accurate     │
│   measurements                        │
└───────────────────────────────────────┘
```

### User Actions
- **Click "Start Calibration"** → Begins 5-second collection
- Tips are always visible for guidance

## State 2: Calibrating (Active)

### Visual Appearance
```
┌───────────────────────────────────────┐
│ 📍 Phone Calibration                  │
├───────────────────────────────────────┤
│ 🔄 Calibrating...                     │
│ Keep boat steady!                     │
│                                       │
│ Progress:                             │
│ ███████████░░░░░░░░░░░░░░░ 45%       │
│ 112 / 250 samples (45%)               │
│                                       │
│  ┌─────────────────────────┐         │
│  │      Cancel             │         │
│  └─────────────────────────┘         │
└───────────────────────────────────────┘
```

### User Experience
- **Progress bar** animates smoothly
- **Sample count** updates in real-time
- **"Keep boat steady!"** pulses gently
- **Cancel button** available if needed
- **Auto-completes** at 250 samples (5 seconds)

### Animation
```
Progress Bar Animation:
0%  ░░░░░░░░░░░░░░░░░░░░░░░░░
25% ██████░░░░░░░░░░░░░░░░░░░
50% ████████████░░░░░░░░░░░░░
75% ██████████████████░░░░░░░
100% ████████████████████████ → Complete!
```

## State 3: Calibrated (Complete)

### Visual Appearance
```
┌───────────────────────────────────────┐
│ 📍 Phone Calibration                  │
├───────────────────────────────────────┤
│ ✅ Calibrated                         │
│                                       │
│ ┌─────────────────────────────────┐  │
│ │ Pitch:    45.2°                 │  │
│ │ Roll:     -2.8°                 │  │
│ │ Gravity:  9.79 m/s²             │  │
│ │ Quality:  Good                  │  │  ← Color coded
│ │ Date:     10/15/2025, 3:42 PM   │  │
│ └─────────────────────────────────┘  │
│                                       │
│  ┌───────────┐  ┌─────────────┐     │
│  │ 🔄 Recal. │  │ 🗑️ Clear    │     │
│  └───────────┘  └─────────────┘     │
│                                       │
│ 💡 Tips: ...                          │
└───────────────────────────────────────┘
```

### Quality Indicators (Color Coded)
```css
Excellent → Green    (variance < 0.05)
Good      → Blue     (variance < 0.10)
Fair      → Orange   (variance < 0.20)
Poor      → Red      (variance ≥ 0.20)
```

### User Actions
- **Recalibrate** → Starts new calibration
- **Clear** → Removes calibration (with confirmation)
- Calibration automatically applied to all measurements

## Demo Mode: Foot Rest Scenario

### What User Sees During Calibration

```
Demo Mode Enabled (45° pitch, -3° roll)

1. Start Calibration
   ↓
2. Progress Bar Fills
   ███████████████████████ 100%
   ↓
3. Results Displayed:
   ┌─────────────────────┐
   │ Pitch:    45.0°     │ ← Detected correctly!
   │ Roll:     -3.2°     │ ← Detected correctly!
   │ Gravity:  9.80 m/s² │ ← Validated
   │ Quality:  Excellent │ ← Low variance
   └─────────────────────┘
```

### Before vs After (User Perspective)

#### Before Calibration
```
Recording Session:
┌────────────────────────────┐
│ Stroke Rate: 12 SPM       │ ← Wrong (should be 25)
│ Drive %:     78%          │ ← Wrong (should be 33%)
│ Split:       N/A          │ ← Unusable
└────────────────────────────┘

Issue: Gravity contamination from 45° pitch
Status: ❌ Unusable data
```

#### After Calibration
```
Recording Session:
┌────────────────────────────┐
│ Stroke Rate: 25 SPM       │ ← Correct!
│ Drive %:     33%          │ ← Correct!
│ Split:       2:05/500m    │ ← Accurate
└────────────────────────────┘

Result: Clean surge signal, accurate metrics
Status: ✅ Production quality data
```

## Responsive Design

### Desktop/Tablet (≥768px)
```
Wide layout:
┌─────────────────────────────────────┐
│  Recalibrate    │    Clear          │
└─────────────────────────────────────┘
Two buttons side-by-side
```

### Mobile (<768px)
```
Stacked layout:
┌─────────────────────────────────────┐
│         Recalibrate                 │
├─────────────────────────────────────┤
│           Clear                     │
└─────────────────────────────────────┘
Full-width buttons
```

## Keyboard Shortcuts

```
Global:
S or s     → Open Settings
Escape     → Close Settings

While in Settings:
Tab        → Navigate controls
Enter      → Activate button
Space      → Toggle checkboxes
```

## Accessibility

### Screen Reader Announcements
```
"Calibration started. Keep device steady."
"Calibration 50% complete."
"Calibration complete. Quality: Good"
"Pitch offset: 45.2 degrees"
"Roll offset: -2.8 degrees"
```

### Visual Indicators
- ✅ Clear icons and emoji
- ✅ Color-coded quality metrics
- ✅ Progress bar for feedback
- ✅ High contrast text
- ✅ Focus indicators on buttons

## Error States

### Insufficient Samples
```
┌───────────────────────────────────────┐
│ ⚠️ Calibration Failed                 │
│                                       │
│ Not enough samples collected.         │
│ Please try again and keep device     │
│ steady for at least 5 seconds.       │
│                                       │
│  ┌─────────────────────────┐         │
│  │    Try Again            │         │
│  └─────────────────────────┘         │
└───────────────────────────────────────┘
```

### Poor Quality Warning
```
┌───────────────────────────────────────┐
│ ✅ Calibrated                         │
│                                       │
│ Quality: Poor                         │ ← Red text
│                                       │
│ ⚠️ Recommendation:                    │
│ Device may have moved during          │
│ calibration. Consider recalibrating   │
│ in calmer conditions for better       │
│ accuracy.                             │
└───────────────────────────────────────┘
```

## Animation & Transitions

### Progress Bar
```css
Transition: smooth width change
Duration: 200ms ease
Color: gradient (accent → primary)
```

### Status Changes
```css
Fade: 300ms
Slide: 200ms ease-out
Color: 400ms
```

### Button Hover
```css
Transform: subtle scale (1.02)
Shadow: increased depth
Transition: 200ms
```

## Integration with Main App

### Header Indicator (Future)
```
┌────────────────────────────────┐
│ 📱 WRC Coach    📍✅  ⚙️  ☰    │
│                  ↑              │
│            Calibrated status    │
└────────────────────────────────┘
```

### Recording Status
```
During Recording:
┌────────────────────────────────┐
│ ⏺️ Recording                    │
│ 📍 Calibration: Active          │ ← Shows if applied
│ Samples: 1,247                  │
└────────────────────────────────┘
```

## Tips Section

### Always Visible
```
💡 Tips:
• Calibrate in calm water or at the dock
• Keep the boat as still as possible
• Recalibrate if phone position changes
• Better quality = more accurate measurements
```

### Contextual (during calibration)
```
Keep boat steady!
[Animated pulse effect]
```

## Real-World Usage Flow

### Typical Session
```
1. Arrive at dock/launch
   ↓
2. Mount phone on foot rest
   ↓
3. Open WRC Coach app
   ↓
4. Enable Demo Mode (for testing)
   ↓
5. Press 'S' → Settings
   ↓
6. See "Not calibrated" at top
   ↓
7. Click "Start Calibration"
   ↓
8. Keep still for 5 seconds
   ↓
9. See "Calibrated - Pitch: 45°"
   ↓
10. Close settings
    ↓
11. Start recording
    ↓
12. Row with accurate measurements! 🚣‍♂️
```

## Summary

The calibration UI is designed to be:

✨ **Discoverable** - Top of settings, can't miss it  
✨ **Simple** - One button to start  
✨ **Clear** - Progress bar, real-time feedback  
✨ **Informative** - Shows angles, quality, date  
✨ **Helpful** - Tips always visible  
✨ **Forgiving** - Can cancel, recalibrate, clear  
✨ **Responsive** - Works on all screen sizes  
✨ **Accessible** - Screen reader support  

The entire flow takes **< 30 seconds** from opening settings to having a calibrated phone ready to use!

---

**Visual consistency** with the rest of the app ensures a seamless user experience. The calibration panel feels like a natural part of the settings, not a bolt-on feature. 🎨✨

