# Migration to React + Vite

## Overview

The WRC Coach application has been successfully migrated from vanilla JavaScript to a modern React + Vite + TypeScript architecture. This migration provides better code organization, testability, and maintainability.

## What Changed

### 1. **Project Structure**

```
wrc-coach/
├── src/
│   ├── lib/                    # ✨ NEW: Extracted algorithm libraries
│   │   ├── filters/            # Signal processing (Kalman, Complementary, BandPass, LowPass)
│   │   ├── stroke-detection/   # Stroke detection algorithms
│   │   ├── data-storage/       # Binary data format (reader/writer)
│   │   └── transforms/         # Coordinate transformations
│   ├── components/             # ✨ NEW: React components
│   │   ├── Header.tsx
│   │   ├── MetricsBar.tsx
│   │   └── ControlPanel.tsx
│   ├── hooks/                  # ✨ NEW: Custom React hooks
│   │   ├── useDeviceMotion.ts
│   │   ├── useGeolocation.ts
│   │   ├── useSettings.ts
│   │   └── useWakeLock.ts
│   ├── utils/                  # ✨ NEW: Utility functions
│   ├── App.tsx                 # Main React app
│   └── main.tsx                # Entry point
├── vite.config.ts              # ✨ NEW: Vite configuration
├── tsconfig.json               # ✨ NEW: TypeScript configuration
├── vitest.config.ts            # ✨ NEW: Test configuration
└── package.json                # ✨ UPDATED: Dependencies and scripts
```

### 2. **Algorithm Libraries (src/lib/)**

All signal processing and stroke detection algorithms have been extracted into standalone, testable libraries:

#### **Filters** (`src/lib/filters/`)
- `KalmanFilterGPS` - GPS/IMU sensor fusion
- `ComplementaryFilter` - Orientation estimation (AHRS)
- `BandPassFilter` - Isolates stroke frequency (0.3-1.2 Hz)
- `LowPassFilter` - Noise reduction

#### **Stroke Detection** (`src/lib/stroke-detection/`)
- `StrokeDetector` - Catch/finish detection
- `BaselineCorrector` - Drag compensation

#### **Data Storage** (`src/lib/data-storage/`)
- `BinaryDataWriter` - Efficient .wrcdata format
- `BinaryDataReader` - Decode binary files

#### **Transforms** (`src/lib/transforms/`)
- `transformToBoatFrame()` - Phone → boat coordinates
- Quaternion utilities

### 3. **Testing Infrastructure**

✅ Vitest setup with example tests
✅ All algorithm libraries are independently testable
✅ Run tests with: `npm test`

Example test:
```typescript
import { KalmanFilterGPS } from '../lib/filters';

describe('KalmanFilterGPS', () => {
  it('fuses GPS and IMU measurements', () => {
    const filter = new KalmanFilterGPS();
    filter.predict(1.0, 0.1);
    filter.updateGPS(0.3);
    expect(filter.getVelocity()).toBeCloseTo(0.3, 1);
  });
});
```

### 4. **TypeScript**

All code is now fully typed with TypeScript, providing:
- Compile-time error detection
- Better IDE autocomplete
- Self-documenting code

### 5. **PWA Support**

PWA functionality is now built-in via `vite-plugin-pwa`:
- Automatic service worker generation
- Offline caching
- Manifest generation

## How to Use

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser: http://localhost:3000
# Use index-vite.html entry point
```

### Testing Algorithms

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test

# Run tests with UI
npm run test:ui
```

### Building for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build
npm run preview
```

### Testing Algorithms Outside the Web App

This was the main goal! Now you can use the algorithms in standalone scripts:

```typescript
// example-script.ts
import { KalmanFilterGPS, ComplementaryFilter } from './src/lib/filters';
import { StrokeDetector } from './src/lib/stroke-detection';

// Use algorithms independently
const filter = new KalmanFilterGPS();
const detector = new StrokeDetector({ 
  catchThreshold: 0.6, 
  finishThreshold: -0.3 
});

// Process your data
const stroke = detector.process(timestamp, acceleration);
```

## Benefits of the New Architecture

### 1. **Testability** ✅
- All algorithms are now in pure TypeScript classes
- Easy to write unit tests
- Can test algorithms with synthetic data
- Run tests: `npm test`

### 2. **Modularity** ✅
- Clear separation of concerns
- Each library has a single responsibility
- Easy to modify one part without breaking others

### 3. **Reusability** ✅
- Algorithms can be used in other projects
- Can create CLI tools, analysis scripts, etc.
- Import only what you need

### 4. **Type Safety** ✅
- TypeScript catches errors at compile time
- Better IDE support (autocomplete, refactoring)
- Self-documenting interfaces

### 5. **Modern Tooling** ✅
- Fast hot-reload with Vite
- Built-in PWA support
- Optimized production builds
- Tree-shaking for smaller bundle size

## Example: Using Filters Standalone

```typescript
// analyze-session.ts
import { BinaryDataReader } from './src/lib/data-storage';
import { KalmanFilterGPS, BandPassFilter } from './src/lib/filters';
import { StrokeDetector } from './src/lib/stroke-detection';

// Read session data
const reader = new BinaryDataReader();
const data = reader.decode(buffer);

// Process with filters
const kalman = new KalmanFilterGPS();
const bandpass = new BandPassFilter(0.3, 1.2, 50);
const detector = new StrokeDetector();

data.imuSamples.forEach(sample => {
  const filtered = bandpass.process(sample.ax);
  const stroke = detector.process(sample.t, filtered);
  
  if (stroke) {
    console.log(`Stroke: ${stroke.strokeRate} SPM, ${stroke.drivePercent}%`);
  }
});
```

## Breaking Changes

### Old Way (app.js)
```javascript
// Everything in one 2000+ line file
class StrokeCoach {
  // Mixed UI and algorithm logic
}
```

### New Way (modular)
```typescript
// Separate, testable libraries
import { StrokeDetector } from './lib/stroke-detection';
import { KalmanFilterGPS } from './lib/filters';

// Use independently
const detector = new StrokeDetector();
```

## Migration Checklist

- [x] Extract signal processing filters
- [x] Extract stroke detection logic
- [x] Extract binary data storage
- [x] Extract coordinate transformations
- [x] Create React components
- [x] Create custom hooks for sensors
- [x] Set up TypeScript
- [x] Set up Vitest for testing
- [x] Configure PWA support
- [x] Add example tests
- [x] Verify build succeeds
- [ ] Implement canvas-based plots (PolarPlot, StabilityPlot) - TODO
- [ ] Add settings panel UI - TODO
- [ ] Test on actual device with sensors - TODO

## What's Next?

### High Priority
1. **Implement Canvas Plots**: Port the polar and stability plots to React components
2. **Settings Panel**: Add UI for configuring thresholds, phone orientation, etc.
3. **Demo Mode**: Port demo mode simulation

### Medium Priority
4. **More Tests**: Add tests for all algorithms
5. **Performance Testing**: Profile with real sensor data
6. **Documentation**: Add JSDoc comments

### Low Priority
7. **Calibration UI**: Port calibration modal
8. **Historical Stroke Display**: Implement stroke history visualization
9. **Export Improvements**: Add CSV export option

## Old Code Status

The old monolithic implementation has been **removed** to keep the codebase clean:
- ❌ `app.js` - Deleted (2088 lines → extracted to libraries)
- ❌ `styles.css` - Deleted (replaced with component CSS)
- ❌ `sw.js` - Deleted (auto-generated by Vite PWA)
- ❌ `manifest.json` - Deleted (auto-generated by Vite PWA)

A backup is available if needed:
- 📦 `index-old.html.backup` - Original entry point (reference only)

**Current entry point**: `index.html` (React app)

## Support

For issues or questions about the migration:
1. Check TypeScript errors: `npm run build`
2. Run tests: `npm test`
3. Check browser console for runtime errors

## License

MIT License - same as original project

