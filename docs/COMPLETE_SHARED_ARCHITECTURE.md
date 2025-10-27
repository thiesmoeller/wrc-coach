# Complete Shared Architecture

## Overview

The WRC Coach project uses a **complete shared codebase** between the PWA and Analysis App. This means:

- ✅ **Algorithms** are shared (filters, stroke detection, transforms)
- ✅ **Components** are shared (UI widgets)
- ✅ **CSS** is shared (styling)
- ✅ **Types** are shared (TypeScript interfaces)

**Result:** Update once, works everywhere! 🎯

## Full Architecture

```
wrc-coach/
├── src/                        🔗 SHARED CODEBASE
│   │
│   ├── lib/                    🔗 Algorithms
│   │   ├── filters/
│   │   │   ├── BandPassFilter.ts
│   │   │   ├── LowPassFilter.ts
│   │   │   ├── ComplementaryFilter.ts
│   │   │   └── KalmanFilterGPS.ts
│   │   ├── stroke-detection/
│   │   │   ├── StrokeDetector.ts
│   │   │   └── BaselineCorrector.ts
│   │   ├── transforms/
│   │   │   └── BoatTransform.ts
│   │   └── data-storage/
│   │       └── BinaryDataWriter.ts
│   │
│   └── components/             🔗 UI Components + CSS
│       ├── StabilityPlot.tsx
│       ├── StabilityPlot.css          ← Imported by both apps
│       ├── MetricsBar.tsx
│       └── MetricsBar.css         ← Imported by both apps
│
├── analysis-app/               📊 Desktop Analysis Tool
│   └── src/
│       ├── lib/
│       │   ├── BinaryDataReader.ts    ← Analysis-specific
│       │   └── DataAnalyzer.ts        ← Analysis-specific
│       └── components/
│           ├── TimeSeriesPlot.tsx     ← Analysis-specific
│           ├── GPSMapPlot.tsx         ← Analysis-specific (with OSM)
│           ├── ParameterPanel.tsx     ← Analysis-specific
│           ├── StatisticsPanel.tsx    ← Analysis-specific
│           └── PWAPreviewTab.tsx      ← Uses shared components
│
└── (PWA specific files)        📱 Mobile Progressive Web App
```

## Import Strategy

### In Analysis App

```typescript
// ========================================
// SHARED ALGORITHMS (from PWA)
// ========================================
import { BandPassFilter } from '@wrc-coach/lib/filters/BandPassFilter';
import { LowPassFilter } from '@wrc-coach/lib/filters/LowPassFilter';
import { StrokeDetector } from '@wrc-coach/lib/stroke-detection/StrokeDetector';
import { BaselineCorrector } from '@wrc-coach/lib/stroke-detection/BaselineCorrector';
import { ComplementaryFilter } from '@wrc-coach/lib/filters/ComplementaryFilter';
import { transformToBoatFrame } from '@wrc-coach/lib/transforms/BoatTransform';

// ========================================
// SHARED COMPONENTS (from PWA)
// ========================================
import { StabilityPlot } from '@wrc-coach/components/StabilityPlot';
import { MetricsBar } from '@wrc-coach/components/MetricsBar';

// Import shared CSS
import '@wrc-coach/components/StabilityPlot.css';
import '@wrc-coach/components/MetricsBar.css';

// ========================================
// ANALYSIS-SPECIFIC (local)
// ========================================
import { BinaryDataReader } from './lib/BinaryDataReader';
import { DataAnalyzer } from './lib/DataAnalyzer';
import { TimeSeriesPlot } from './components/TimeSeriesPlot';
import { GPSMapPlot } from './components/GPSMapPlot';
```

### In PWA

```typescript
// Normal local imports
import { BandPassFilter } from './lib/filters/BandPassFilter';
import { StabilityPlot } from './components/StabilityPlot';
import './components/StabilityPlot.css';
```

## Configuration

### Vite Config (analysis-app/vite.config.ts)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@wrc-coach/lib': path.resolve(__dirname, '../src/lib'),
      '@wrc-coach/components': path.resolve(__dirname, '../src/components'),
    },
  },
});
```

### TypeScript Config (analysis-app/tsconfig.json)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@wrc-coach/lib/*": ["../src/lib/*"],
      "@wrc-coach/components/*": ["../src/components/*"]
    }
  },
  "include": ["src", "../src/lib", "../src/components"]
}
```

## Optimization Workflow

### Example: Improving Stroke Detection

1. **Identify Issue** (in either app)
   - PWA: Strokes not detected during testing
   - Analysis: Load historical data, see same issue

2. **Debug in Analysis App** (desktop tools)
   ```typescript
   // Load test data
   const data = reader.decode(buffer);
   
   // Try different parameters
   const params = { catchThreshold: 0.5 }; // Lower threshold
   
   // See results immediately in plots
   ```

3. **Fix in Shared Code** (once)
   ```typescript
   // Edit: src/lib/stroke-detection/StrokeDetector.ts
   // Improve algorithm
   ```

4. **Test in Both Apps** (automatically updated)
   - PWA: Test live on water
   - Analysis: Test with historical sessions

5. **Deploy** ✅
   - Both apps use improved algorithm
   - No manual syncing needed
   - Guaranteed consistency

### Example: Optimizing StabilityPlot

1. **Notice Performance Issue**
   - PWA: Laggy with many strokes
   - Analysis: Preview tab shows same lag

2. **Profile in Analysis App**
   ```typescript
   // PWA Preview tab
   // Use browser DevTools Performance profiler
   // Identify expensive drawing operations
   ```

3. **Optimize Component** (once)
   ```typescript
   // Edit: src/components/StabilityPlot.tsx
   // Reduce sample count
   // Optimize canvas operations
   ```

4. **CSS Improvements** (optional)
   ```css
   /* Edit: src/components/StabilityPlot.css */
   /* Improve visual appearance */
   ```

5. **Verify in Both Apps**
   - PWA: Smooth live performance
   - Analysis: Fast playback

## Benefits Summary

### 🎯 Single Source of Truth
| What | Location | Used By |
|------|----------|---------|
| Algorithms | `src/lib/` | PWA + Analysis |
| Components | `src/components/*.tsx` | PWA + Analysis |
| CSS | `src/components/*.css` | PWA + Analysis |
| Types | `src/lib/*/index.ts` | PWA + Analysis |

### ✅ Zero Duplication
- No copied code
- No copied CSS
- No version drift
- No sync maintenance

### 🚀 Cross-Optimization
- Fix bug → Fixed everywhere
- Optimize → Faster everywhere
- Add feature → Available everywhere
- Update UI → Consistent everywhere

### 🔧 Better Development
- Test with real data (analysis app)
- Debug with desktop tools
- Preview mobile experience
- Tune parameters visually

## Real-World Examples

### Scenario 1: Improving Filter Performance

**Problem:** Band-pass filter too slow

**Steps:**
1. Analysis app → Load large session
2. Profile → Identify bottleneck
3. Edit `src/lib/filters/BandPassFilter.ts` → Optimize
4. Test PWA → Smooth real-time
5. Test Analysis → Fast batch processing

**Result:** ✅ Both apps faster automatically

### Scenario 2: Better Stroke Detection

**Problem:** Missing strokes in rough water

**Steps:**
1. Export rough water session
2. Analysis app → Load data
3. Parameter panel → Try different thresholds
4. Edit `src/lib/stroke-detection/StrokeDetector.ts` → Improve logic
5. Apply same settings in PWA

**Result:** ✅ Better detection in both apps

### Scenario 3: UI Improvements

**Problem:** StabilityPlot hard to read

**Steps:**
1. Analysis app → PWA Preview tab
2. Edit `src/components/StabilityPlot.tsx` → Better layout
3. Edit `src/components/StabilityPlot.css` → Better colors
4. Preview → Looks good
5. Test PWA → Looks identical

**Result:** ✅ Better UX in both apps

## File Organization

### Shared Files (in PWA directory)

```
src/
├── lib/                        ← All algorithms
│   ├── filters/
│   ├── stroke-detection/
│   ├── transforms/
│   └── data-storage/
│
└── components/                 ← Reusable components
    ├── StabilityPlot.tsx
    ├── StabilityPlot.css
    ├── MetricsBar.tsx
    └── MetricsBar.css
```

### Analysis-Specific Files

```
analysis-app/src/
├── lib/                        ← Analysis utilities
│   ├── BinaryDataReader.ts
│   └── DataAnalyzer.ts
│
├── components/                 ← Analysis UI
│   ├── TimeSeriesPlot.tsx
│   ├── GPSMapPlot.tsx
│   ├── ParameterPanel.tsx
│   ├── StatisticsPanel.tsx
│   └── PWAPreviewTab.tsx
│
├── types.ts                    ← Analysis types
└── App.tsx                     ← Main app
```

### PWA-Specific Files

```
src/
├── App.tsx                     ← PWA main app
├── components/
│   ├── Header.tsx              ← PWA-specific
│   ├── ControlPanel.tsx        ← PWA-specific
│   ├── SettingsPanel.tsx       ← PWA-specific
│   └── ... (shared components above)
├── hooks/
│   ├── useDeviceMotion.ts
│   ├── useGeolocation.ts
│   └── ...
└── main.tsx
```

## Best Practices

### DO ✅

**For Shared Code:**
- Keep in `src/lib/` or `src/components/`
- Make reusable and generic
- Document props and parameters
- Handle edge cases
- Write once, use everywhere

**For App-Specific Code:**
- Keep in respective app directories
- Can depend on shared code
- Can have app-specific logic

### DON'T ❌

**Never:**
- Duplicate shared code
- Copy-paste between apps
- Create parallel implementations
- Modify imported shared code locally
- Hardcode app-specific values in shared code

## Testing Strategy

### Test Shared Code

```typescript
// tests/lib/BandPassFilter.test.ts
describe('BandPassFilter', () => {
  it('filters rowing frequency', () => {
    // Test applies to both apps
  });
});
```

### Test in Context

**PWA Context:**
```typescript
// Real-time data stream
// Mobile device constraints
// Touch interactions
```

**Analysis Context:**
```typescript
// Historical data batches
// Desktop performance
// Mouse interactions
// Parameter tuning
```

## Deployment

### PWA Deployment
```bash
npm run build
# Deploy dist/ to production server
```

### Analysis App Deployment
```bash
cd analysis-app
npm run build
# Deploy dist/ to static host
```

**Note:** Each app bundles shared code independently - no runtime dependencies between apps.

## Maintenance

### Updating Shared Code

1. Edit files in `src/lib/` or `src/components/`
2. Test in PWA (live context)
3. Test in analysis app (historical context)
4. Both apps automatically use updates
5. Deploy each app independently

### Version Control

```bash
# Shared code in main project
git add src/lib/
git add src/components/
git commit -m "Improve stroke detection algorithm"

# Both apps pull changes automatically
```

## Troubleshooting

### Import Not Resolving

**Problem:** `Cannot find module '@wrc-coach/lib/...'`

**Solution:**
1. Check `vite.config.ts` alias paths
2. Check `tsconfig.json` path mapping
3. Ensure files exist in `../src/lib/`

### CSS Not Loading

**Problem:** Shared component CSS not applied

**Solution:**
```typescript
// Explicitly import CSS
import '@wrc-coach/components/StabilityPlot.css';
```

### Type Errors

**Problem:** TypeScript can't find shared types

**Solution:**
```json
// tsconfig.json
{
  "include": ["src", "../src/lib", "../src/components"]
}
```

## Future Enhancements

### Monorepo Structure

Could evolve to:
```
wrc-coach/
├── packages/
│   ├── core/           ← Shared lib + components
│   ├── pwa/            ← Mobile app
│   └── analysis/       ← Desktop app
└── package.json        ← Workspace root
```

### npm Package

Publish shared code:
```bash
npm publish @wrc-coach/core
```

Then import in both apps:
```typescript
import { BandPassFilter } from '@wrc-coach/core';
```

## Conclusion

**Complete code sharing means:**

- 🎯 **One codebase** for algorithms and UI components
- 🔄 **Zero duplication** - everything imported
- ✅ **Perfect consistency** - impossible to drift
- 🚀 **Cross-optimization** - improve once, benefit twice
- 🛠️ **Better tools** - debug on desktop, deploy to mobile

**This is the power of shared architecture!** 🎊

---

**See also:**
- `SHARED_ARCHITECTURE.md` - Algorithm sharing details
- `SHARED_COMPONENTS.md` - Component sharing details
- `README.md` - User documentation

