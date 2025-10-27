# Shared Components Architecture

## Overview

The WRC Coach project now uses **shared components** between the PWA and Analysis App. This means you can optimize the UI/UX in one place and both applications benefit automatically.

## Shared Component Structure

```
wrc-coach/
├── src/
│   ├── lib/                    🔗 SHARED ALGORITHMS
│   │   ├── filters/
│   │   ├── stroke-detection/
│   │   └── ...
│   │
│   └── components/             🔗 SHARED UI COMPONENTS
│       ├── CartesianPlot.tsx     ← Used by both apps
│       ├── CartesianPlot.css     ← Shared styling (imported by both)
│       ├── StabilityPlot.tsx     ← Used by both apps
│       ├── StabilityPlot.css     ← Shared styling (imported by both)
│       ├── MetricsBar.tsx      ← Used by both apps
│       └── MetricsBar.css      ← Shared styling (imported by both)
│
└── analysis-app/
    ├── src/
    │   ├── components/
    │   │   ├── PWAPreviewTab.tsx       ← Shows PWA components
    │   │   ├── TimeSeriesPlot.tsx      ← Analysis-specific
    │   │   └── GPSMapPlot.tsx          ← Analysis-specific
    │   └── ...
```

**Note:** CSS files are now **imported** from the shared location, not copied!

## Import Pattern

### Analysis App Imports PWA Components

```typescript
// Import shared components from PWA
import { CartesianPlot } from '@wrc-coach/components/CartesianPlot';
import { StabilityPlot } from '@wrc-coach/components/StabilityPlot';
import { MetricsBar } from '@wrc-coach/components/MetricsBar';

// Import shared CSS from PWA (Vite handles this automatically)
import '@wrc-coach/components/CartesianPlot.css';
import '@wrc-coach/components/StabilityPlot.css';
import '@wrc-coach/components/MetricsBar.css';

// Use them exactly as in PWA
<CartesianPlot samples={data} historyStrokes={3} trailOpacity={50} />
```

**Key Point:** Both the TypeScript components AND their CSS are imported from the shared location - no duplication!

## Shared Components

### 1. CartesianPlot (Acceleration Pattern)
**Location:** `src/components/CartesianPlot.tsx`

**Purpose:** Visualizes rowing stroke acceleration pattern in cartesian coordinates

**Props:**
- `samples` - Array of samples with `t`, `surgeHP`, `inDrive`
- `historyStrokes` - Number of historical strokes to show
- `trailOpacity` - Opacity of trail (0-100)

**Features:**
- Canvas-based rendering for performance
- Shows drive vs recovery phases
- Displays ideal pattern overlay
- Handles multiple strokes with fade

**Used in:**
- ✅ PWA: Live stroke visualization
- ✅ Analysis App: PWA Preview tab (with playback)

### 2. StabilityPlot (Boat Balance)
**Location:** `src/components/StabilityPlot.tsx`

**Purpose:** Shows boat roll (port/starboard) during stroke cycle

**Props:**
- `samples` - Array of samples with `strokeAngle`, `roll`

**Features:**
- Canvas-based rendering
- Port (red) vs Starboard (green) coloring
- Shows roll throughout stroke cycle
- Wraps 360° for continuous display

**Used in:**
- ✅ PWA: Live balance feedback
- ✅ Analysis App: PWA Preview tab (with playback)

### 3. MetricsBar (Performance Metrics)
**Location:** `src/components/MetricsBar.tsx`

**Purpose:** Displays key rowing metrics in cards

**Props:**
- `strokeRate` - Strokes per minute (SPM)
- `drivePercent` - Drive ratio percentage
- `splitTime` - Split time string (MM:SS /500m)
- `sampleCount` - Number of data points

**Features:**
- Responsive card layout
- Clear metric labels and units
- Clean, modern design

**Used in:**
- ✅ PWA: Real-time metrics display
- ✅ Analysis App: PWA Preview tab

## PWA Preview Tab

The Analysis App includes a **PWA Preview tab** that:

### Features
1. **Playback Controls**
   - Play/pause simulation
   - Adjustable speed (0.5x to 10x)
   - Progress slider
   - Reset button

2. **Live Component Preview**
   - Shows CartesianPlot with historical data
   - Shows StabilityPlot with roll data
   - Shows MetricsBar with current metrics
   - Simulates real-time PWA experience

3. **Development Benefits**
   - Test component changes with real data
   - See how components handle edge cases
   - Preview mobile layout on desktop
   - Optimize performance

### Usage

```typescript
// In analysis app - PWA Preview tab
<PWAPreviewTab
  sessionData={sessionData}
  analysisResults={analysisResults}
/>
```

## Benefits of Shared Components

### ✅ Single Source of Truth
- Component code lives in one place (`src/components/`)
- No duplication between apps
- Changes propagate automatically

### ✅ Consistent User Experience
- PWA and preview look identical
- Same animations and interactions
- Same visual styling

### ✅ Easier Optimization
- Improve performance once → faster everywhere
- Fix UI bug once → fixed in both apps
- Add feature once → available in both apps

### ✅ Better Testing
- Test with historical data in analysis app
- Validate with live data in PWA
- Catch edge cases before production

## Development Workflow

### Making Component Changes

1. **Edit component** in `src/components/`
   ```bash
   vim src/components/CartesianPlot.tsx
   ```

2. **Test in PWA** (live data)
   ```bash
   npm run dev
   # Test on mobile device
   ```

3. **Test in Analysis App** (historical data)
   ```bash
   cd analysis-app
   npm run dev
   # Click "PWA Preview" tab
   # Load test session
   # Use playback controls
   ```

4. **Both apps automatically use new version** ✅

### Adding New Shared Components

1. Create in `src/components/` (PWA directory)
2. Export from component file
3. Import in both apps using `@wrc-coach/components/*`
4. Test in both contexts

## Component-Specific Notes

### CartesianPlot Performance

Canvas rendering for smooth 50Hz updates:
- Uses `requestAnimationFrame` implicitly via React
- Handles 500+ samples efficiently
- Scales plot dynamically

**Optimization tips:**
- Limit visible history (3-5 strokes)
- Use trail opacity < 70% for performance
- Clear canvas completely on each frame

### StabilityPlot Edge Cases

Handles stroke angle wrap-around (359° → 0°):
- Duplicates catch samples at 360° for continuity
- Detects angle jumps and starts new path segments
- Scales roll dynamically based on max observed

**Optimization tips:**
- Filter noisy roll data before passing to component
- Limit samples to current stroke only
- Use complementary filter for smooth orientation

### MetricsBar Responsiveness

Responsive grid layout:
- Uses `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`
- Wraps on small screens
- Maintains readability at all sizes

**Styling tips:**
- Keep metric labels short
- Use consistent units
- Ensure good contrast ratios

## CSS Handling

### Shared CSS Files

CSS files are **imported directly** from PWA components:

```typescript
// In analysis app
import '@wrc-coach/components/CartesianPlot.css';
```

Vite automatically resolves the aliased path and includes the CSS in the bundle.

### Benefits

✅ **Single source of truth** - CSS lives in one place  
✅ **Automatic updates** - Change CSS once, works everywhere  
✅ **No copying** - Import directly from shared location  
✅ **No sync needed** - Always consistent  

### When CSS Changes

Just edit the source file:
1. Edit `src/components/Component.css`
2. Both apps automatically use the updated CSS ✨
3. No copying, no syncing needed!

## Future Enhancements

### Potential New Shared Components

- [ ] **ControlPanel** - Settings and configuration
- [ ] **SessionList** - Session history browser
- [ ] **StrokeTable** - Stroke-by-stroke metrics table
- [ ] **PowerCurve** - Power vs boat speed
- [ ] **ComparisonView** - Compare multiple sessions

### Build Optimization

Consider creating a shared component library:
- Separate npm package
- Versioned releases
- Publishable to npm registry
- Import as dependency in both apps

## Best Practices

### DO ✅
- Keep components in `src/components/`
- Use `@wrc-coach/components/*` imports
- Test in both PWA and analysis app
- Document props and usage
- Handle edge cases (empty data, etc.)

### DON'T ❌
- Don't duplicate component code
- Don't create parallel implementations
- Don't modify imported components locally
- Don't assume specific data formats
- Don't hardcode mobile-specific values

## Troubleshooting

### Import Errors

**Problem:** `Cannot find module '@wrc-coach/components/...'`

**Solution:** Check vite.config.ts has correct alias:
```typescript
resolve: {
  alias: {
    '@wrc-coach/components': path.resolve(__dirname, '../src/components'),
  },
}
```

### CSS Not Loading

**Problem:** Shared component CSS not applied

**Solution:** Ensure CSS files copied to analysis-app:
```bash
cp src/components/*.css analysis-app/src/components/
```

### Props Mismatch

**Problem:** Component expects different props

**Solution:** Check TypeScript interfaces match:
```typescript
// Should be identical in both apps
interface CartesianPlotProps {
  samples: Array<{...}>;
  historyStrokes: number;
  trailOpacity: number;
}
```

## Real-World Example

### Optimizing CartesianPlot

**Scenario:** CartesianPlot is laggy with many strokes

**Steps:**

1. **Load test data in analysis app**
   ```typescript
   // PWA Preview tab with 100+ strokes
   ```

2. **Profile performance**
   ```typescript
   // Use browser DevTools Performance tab
   // Identify expensive operations
   ```

3. **Optimize in src/components/CartesianPlot.tsx**
   ```typescript
   // Reduce sample count
   // Optimize drawing operations
   // Add memoization
   ```

4. **Test improvements**
   - PWA: Real-time feels smooth
   - Analysis: Playback handles fast forward

5. **Deploy**
   - Both apps benefit automatically
   - No sync needed

## Conclusion

Shared components ensure:
- 🎯 Consistent UI/UX across apps
- 🚀 Faster development (write once)
- ✅ Easier maintenance (fix once)
- 🔧 Better testing (preview with real data)

**One codebase for components, perfect consistency everywhere!** 🎊

---

*See also: `SHARED_ARCHITECTURE.md` for algorithm sharing details*

