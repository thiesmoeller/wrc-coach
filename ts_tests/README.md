# TypeScript Tests

Integration and simulation tests for WRC Coach.

## Contents

### `test_stroke_simulation.ts`
Comprehensive stroke cycle simulation and testing.

**Purpose:**
- Simulate realistic rowing stroke patterns
- Test stroke detection algorithms
- Validate filter performance
- Generate test data for development

**Usage:**
```bash
# Run with ts-node
npx ts-node ts_tests/test_stroke_simulation.ts

# Or compile and run
tsc ts_tests/test_stroke_simulation.ts
node ts_tests/test_stroke_simulation.js
```

**Features:**
- Simulates realistic acceleration patterns
- Configurable stroke rate (SPM)
- Drive/recovery phase timing
- Noise injection for realism
- Export to binary format

**Configuration:**
```typescript
const config = {
  strokeRate: 28,        // Strokes per minute
  driveRatio: 0.4,       // Drive takes 40% of cycle
  duration: 60,          // Seconds
  sampleRate: 50,        // Hz
  noiseLevel: 0.1        // Acceleration noise
};
```

## Running Tests

### Unit Tests (Vitest)
```bash
# Run all tests
npm test

# Watch mode
npm run test

# UI mode
npm run test:ui

# Run once
npm run test:run
```

**Test locations:**
- `src/lib/filters/__tests__/` - Filter tests
- `src/lib/stroke-detection/__tests__/` - Stroke detection tests

### Integration Tests
```bash
# Run stroke simulation
npx ts-node ts_tests/test_stroke_simulation.ts
```

## Test Data

### Generating Test Data
```typescript
import { StrokeSimulator } from './test_stroke_simulation';

const simulator = new StrokeSimulator({
  strokeRate: 30,
  duration: 120
});

const samples = simulator.generate();
const binary = simulator.exportBinary();
```

### Using Test Data
Test data can be:
- Exported to `.wrcdata` format
- Loaded in PWA for visual testing
- Used for algorithm validation
- Compared with real session data

## Development Workflow

### 1. Algorithm Development
```bash
# Write algorithm in src/lib/
# Create unit tests in __tests__/
npm test src/lib/feature/__tests__/
```

### 2. Integration Testing
```bash
# Test with simulated data
npx ts-node ts_tests/test_stroke_simulation.ts

# Load in PWA dev server
npm run dev
# Enable demo mode → uses simulated data
```

### 3. Real Data Validation
```bash
# Record real session in PWA
# Export .wrcdata file
# Analyze with Python scripts
python py_scripts/visualize_wrcdata.py session.wrcdata
```

## Test Coverage

Current test coverage areas:
- ✅ Kalman GPS filter
- ✅ Low-pass filter
- ✅ Stroke detection
- ✅ Stroke simulation
- ⚠️ Complementary filter (needs tests)
- ⚠️ Band-pass filter (needs tests)
- ⚠️ Baseline corrector (needs tests)

### Adding Tests

**For new features:**
1. Create `__tests__/` folder next to implementation
2. Name test file: `FeatureName.test.ts`
3. Write tests using Vitest
4. Run: `npm test`

**Example:**
```typescript
// src/lib/myfeature/__tests__/MyFeature.test.ts
import { describe, it, expect } from 'vitest';
import { MyFeature } from '../MyFeature';

describe('MyFeature', () => {
  it('should do something', () => {
    const feature = new MyFeature();
    expect(feature.process(1)).toBe(2);
  });
});
```

## Simulation Parameters

### Realistic Values
Based on real rowing data:

**Stroke Rate:**
- Light paddling: 18-22 SPM
- Steady state: 22-28 SPM
- Race pace: 28-36 SPM
- Sprint: 36-44 SPM

**Drive Ratio:**
- Typical: 35-45% drive, 55-65% recovery
- Rush the slide: >45% drive (bad)
- Slow recovery: <35% drive (inefficient)

**Acceleration:**
- Peak drive: 2-4 m/s² forward
- Peak recovery: -1 to -2 m/s² backward
- Catch: Sharp positive acceleration
- Finish: Sharp negative acceleration

**GPS Speed:**
- Light: 2-3 m/s
- Steady: 3-4 m/s
- Race: 4-5 m/s
- Sprint: 5-6 m/s

### Tuning for Testing

**High noise (challenging conditions):**
```typescript
noiseLevel: 0.3,
waterChop: true,
windEffect: 0.2
```

**Ideal conditions (algorithm validation):**
```typescript
noiseLevel: 0.05,
waterChop: false,
perfectTiming: true
```

## Debugging

### Visual Debugging
```bash
# Generate test data
npx ts-node ts_tests/test_stroke_simulation.ts > test_data.wrcdata

# Visualize
python py_scripts/visualize_wrcdata.py test_data.wrcdata
```

### Console Debugging
```typescript
// Add debug output to simulation
console.log('Stroke phase:', phase);
console.log('Acceleration:', accel);
console.log('Detected:', detector.isInDrive());
```

### Comparison Testing
```bash
# Compare simulated vs real data
python compare_sessions.py simulated.wrcdata real.wrcdata
```

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Main branch commits
- Pre-deployment

**GitHub Actions:**
```yaml
- name: Run tests
  run: npm test
```

## Performance Testing

### Benchmarking
```typescript
import { performance } from 'perf_hooks';

const start = performance.now();
// ... run algorithm ...
const end = performance.now();
console.log(`Took ${end - start}ms`);
```

### Memory Profiling
```bash
# Run with memory profiling
node --inspect ts_tests/test_stroke_simulation.js
# Open chrome://inspect
```

## Known Issues

1. **Simulation not perfectly realistic**
   - Missing boat physics
   - No water drag simulation
   - Simplified stroke pattern

2. **Test data differs from real data**
   - Real data has more noise
   - Phone orientation affects readings
   - Environmental factors not simulated

## Future Improvements

- [ ] Add boat physics simulation
- [ ] Water condition variations
- [ ] Multiple rower simulation (crew boat)
- [ ] GPS accuracy simulation
- [ ] Phone orientation variations
- [ ] Battery drain testing
- [ ] Network offline scenarios
- [ ] Storage quota testing

## Resources

- **Unit Testing:** [Vitest Documentation](https://vitest.dev/)
- **TypeScript:** [TS Handbook](https://www.typescriptlang.org/docs/)
- **Rowing Physics:** See `docs/RESEARCH_BASED_PATTERN.md`

---

**Note:** These tests are for development only and not included in the production PWA build.

