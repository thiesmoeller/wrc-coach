# Shared Architecture

## Overview

The WRC Coach Analysis App uses a **shared algorithm architecture** with the PWA. Instead of duplicating code, both applications import from the same source files in `../src/lib/`.

## Architecture Diagram

```
wrc-coach/
├── src/
│   ├── lib/                    🔗 SHARED ALGORITHMS
│   │   ├── filters/
│   │   │   ├── BandPassFilter.ts   ← Used by both apps
│   │   │   ├── LowPassFilter.ts    ← Used by both apps
│   │   │   └── ...
│   │   ├── stroke-detection/
│   │   │   ├── StrokeDetector.ts   ← Used by both apps
│   │   │   ├── BaselineCorrector.ts ← Used by both apps
│   │   │   └── ...
│   │   ├── data-storage/
│   │   │   └── BinaryDataWriter.ts ← Shared types
│   │   └── transforms/
│   │       └── BoatTransform.ts    ← Used by both apps
│   │
│   └── components/             🔗 SHARED UI COMPONENTS
│       ├── StabilityPlot.tsx       ← Used by both apps
│       ├── StabilityPlot.css       ← Shared CSS (imported by both)
│       ├── MetricsBar.tsx      ← Used by both apps
│       └── MetricsBar.css      ← Shared CSS (imported by both)
│
├── analysis-app/               ← Analysis tool
│   └── src/
│       ├── lib/
│       │   ├── BinaryDataReader.ts  ← Analysis-specific
│       │   └── DataAnalyzer.ts      ← Analysis-specific
│       └── components/              ← Analysis-specific UI
│           ├── TimeSeriesPlot.tsx
│           ├── GPSMapPlot.tsx
│           └── PWAPreviewTab.tsx    ← Uses shared components
│
└── (PWA files...)              ← Mobile app
```

**Key: 🔗 = Shared between both apps (zero duplication)**

## Import Pattern

### Analysis App Imports Shared Code

```typescript
// Algorithms (shared)
import { BandPassFilter } from '@wrc-coach/lib/filters/BandPassFilter';
import { StrokeDetector } from '@wrc-coach/lib/stroke-detection/StrokeDetector';

// Components (shared)
import { StabilityPlot } from '@wrc-coach/components/StabilityPlot';
import '@wrc-coach/components/StabilityPlot.css';  // CSS also shared!
```

**Everything is imported from the shared location - zero duplication!**

### Path Mapping Configuration

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@wrc-coach/lib/*": ["../src/lib/*"]
    }
  },
  "include": ["src", "../src/lib"]
}
```

**vite.config.ts:**
```typescript
{
  resolve: {
    alias: {
      '@wrc-coach/lib': path.resolve(__dirname, '../src/lib'),
    },
  }
}
```

## Benefits

### ✅ Single Source of Truth
- Algorithm code lives in one place
- No duplication
- No version drift

### ✅ Automatic Consistency
- PWA and analysis app always use same algorithms
- Fix bug once → fixed everywhere
- Optimize once → faster everywhere

### ✅ Easier Maintenance
- Update filter logic in one file
- Test once, works in both apps
- No need to keep copies in sync

### ✅ Type Safety
- Shared TypeScript types
- Interfaces exported from PWA
- Compile-time consistency checks

## Shared Components

### Algorithms
- `BandPassFilter` - 0.3-1.2 Hz stroke frequency isolation
- `LowPassFilter` - Exponential smoothing
- `StrokeDetector` - Catch/finish detection
- `BaselineCorrector` - Drift compensation
- `BoatTransform` - Coordinate transformations
- `ComplementaryFilter` - Orientation estimation

### Types
- `IMUSample` - Accelerometer + gyroscope data
- `GPSSample` - GPS position and speed
- `StrokeInfo` - Stroke metrics
- `Orientation` - Pitch/roll/yaw angles

### Data Formats
- Binary .wrcdata format specification
- Sample structures
- Metadata fields

## Analysis-Specific Code

Only these files are unique to the analysis app:

```
analysis-app/src/
├── lib/
│   ├── BinaryDataReader.ts     ← Reads .wrcdata files
│   └── DataAnalyzer.ts          ← Orchestrates analysis
├── components/
│   ├── TimeSeriesPlot.tsx       ← SVG visualization
│   ├── GPSMapPlot.tsx           ← GPS route rendering
│   ├── ParameterPanel.tsx       ← UI for tuning
│   └── StatisticsPanel.tsx      ← Session stats
├── App.tsx                      ← Main app layout
└── types.ts                     ← Analysis-specific types
```

## Development Workflow

### Making Algorithm Changes

1. **Edit shared algorithm** in `src/lib/`
   ```bash
   # Edit the source of truth
   vim src/lib/filters/BandPassFilter.ts
   ```

2. **Test in PWA**
   ```bash
   npm run dev        # Test live in mobile app
   ```

3. **Test in Analysis App**
   ```bash
   cd analysis-app
   npm run dev        # Test with historical data
   ```

4. **Both apps automatically use new code** ✅

### Adding New Algorithms

1. Create in `src/lib/` (PWA directory)
2. Export from appropriate index file
3. Import in both apps using `@wrc-coach/lib/*`
4. Both apps now share the new algorithm

### Debugging Shared Code

- Set breakpoints in `src/lib/` files
- Works in both PWA and analysis app
- Single code path to debug
- Easier to trace issues

## Example: Tuning Band-Pass Filter

Let's say you want to optimize the band-pass filter:

### 1. Test with Historical Data
```typescript
// analysis-app - load old sessions
const params = {
  lowCutFreq: 0.25,  // Try different values
  highCutFreq: 1.5
};
const results = DataAnalyzer.analyze(data, params);
// See results immediately
```

### 2. Update Algorithm (Optional)
```typescript
// src/lib/filters/BandPassFilter.ts
// Improve the algorithm itself
export class BandPassFilter {
  // Enhanced implementation
}
```

### 3. Apply to Live PWA
```typescript
// PWA automatically uses updated code
// Settings panel uses same parameters
// Consistent behavior guaranteed
```

### 4. No Manual Syncing Needed! ✅

## Build Considerations

### Development Mode
- Vite dev server resolves paths correctly
- Hot module reload works across directories
- TypeScript checks shared files

### Production Build
- Vite bundles shared code into analysis app
- No runtime dependency on PWA
- Standalone deployment possible

### Bundle Size
- Shared code included once
- No duplication in bundle
- Efficient tree-shaking

## Testing Strategy

### Unit Tests
Test shared algorithms once:
```typescript
// tests/lib/BandPassFilter.test.ts
describe('BandPassFilter', () => {
  it('filters stroke frequency', () => {
    // Test applies to both apps
  });
});
```

### Integration Tests
Test in both contexts:
```typescript
// PWA integration test
describe('Live stroke detection', () => {
  // Test with real-time data
});

// Analysis app integration test
describe('Batch analysis', () => {
  // Test with historical data
});
```

## Migration Summary

### What Changed
- ❌ Removed duplicated algorithm files from `analysis-app/src/lib/`
- ✅ Added path aliases in tsconfig and vite config
- ✅ Updated imports to use `@wrc-coach/lib/*`
- ✅ Re-export shared types from PWA

### What Stayed the Same
- Analysis-specific code (UI, BinaryDataReader, DataAnalyzer)
- PWA code unchanged
- All functionality preserved
- Same user experience

### Benefits Gained
- 🎯 Single source of truth
- 🔄 Automatic synchronization
- 🚀 Easier maintenance
- ✅ Guaranteed consistency
- 🐛 Fewer bugs (no copy-paste errors)

## Best Practices

### DO ✅
- Keep algorithms in `src/lib/` (PWA directory)
- Use `@wrc-coach/lib/*` imports in analysis app
- Test changes in both apps
- Document shared interfaces

### DON'T ❌
- Don't duplicate algorithm code
- Don't create parallel implementations
- Don't modify imported algorithms locally
- Don't break the shared interface

## Future Enhancements

### Potential Improvements
- [ ] Shared test utilities
- [ ] Shared type library package
- [ ] npm workspace setup
- [ ] Monorepo structure
- [ ] Shared configuration files

### Keeping It Simple
For now, the file path alias approach:
- ✅ Works well
- ✅ Simple to understand
- ✅ Easy to maintain
- ✅ No build complexity

## Troubleshooting

### Import Errors

**Problem:** `Cannot find module '@wrc-coach/lib/...'`

**Solution:** Check vite.config.ts and tsconfig.json have correct paths

### Type Errors

**Problem:** Types not resolved from shared files

**Solution:** Ensure tsconfig includes `"../src/lib"` in `include` array

### Build Errors

**Problem:** Production build fails to resolve paths

**Solution:** Vite alias should use `path.resolve(__dirname, '../src/lib')`

## Conclusion

The shared architecture ensures both apps always use the same algorithms, making it easy to:
- 🎯 Tune parameters in analysis app
- 🚀 Apply same settings in PWA
- ✅ Get consistent results
- 🔧 Maintain code in one place

**One codebase, two applications, perfect consistency!** 🎊

