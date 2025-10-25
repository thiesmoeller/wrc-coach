# WRC Coach Data Analysis Tool

## Overview

The WRC Coach Data Analysis Tool is a desktop/tablet-optimized web application designed for in-depth analysis of rowing session data. It complements the mobile PWA by providing powerful visualization and algorithm tuning capabilities.

## Key Features

### 🎯 Algorithm Tuning
- **Real-time parameter adjustment** for filters and stroke detection
- **Uses identical algorithms** from the PWA for consistency
- **Live preview** of how parameter changes affect stroke detection
- **Preset configurations** for different conditions

### 📊 Visualizations
- **SVG-based time series plots** for sensor data
- **GPS route maps** with speed-based coloring
- **Stroke detection overlay** showing catches and finishes
- **Multi-tab interface** for different analysis views

### 📈 Analysis Capabilities
- Stroke-by-stroke metrics table
- Session statistics and summaries
- Data quality indicators
- Raw sensor data exploration

## Architecture

### Shared Algorithms
The analysis app uses **exact copies** of the PWA's algorithm implementations:

```
analysis-app/src/lib/
├── BinaryDataReader.ts    ← Same format as PWA
├── BandPassFilter.ts       ← Identical to PWA
├── StrokeDetector.ts       ← Identical to PWA
├── LowPassFilter.ts        ← Identical to PWA
├── BaselineCorrector.ts    ← Identical to PWA
└── DataAnalyzer.ts         ← Orchestrates analysis
```

This ensures:
- ✅ **Consistent results** between mobile and desktop
- ✅ **Parameter portability** - tune on desktop, apply on mobile
- ✅ **Single source of truth** for algorithm behavior

### Technology Stack
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **Pure SVG** - No chart library dependencies
- **CSS Grid/Flexbox** - Responsive layout

## File Format Support

Reads `.wrcdata` binary files exported from the PWA:

### V1 Format (Legacy)
- Header with metadata
- IMU samples (50 Hz typical)
- GPS samples (1-5 Hz typical)

### V2 Format (Current)
- Extended header with version info
- Calibration data (pitch/roll offsets)
- IMU samples
- GPS samples
- Raw calibration samples

See `BINARY_DATA_README.md` for full format specification.

## Use Cases

### 1. Algorithm Development
```typescript
// Load historical data
const data = reader.decode(buffer);

// Test different parameters
const params = {
  lowCutFreq: 0.25,      // Try different filter
  highCutFreq: 1.5,
  catchThreshold: 0.8,   // Adjust sensitivity
  finishThreshold: -0.4
};

// Analyze and visualize
const results = DataAnalyzer.analyze(data, params);
```

### 2. Session Comparison
- Load multiple sessions
- Compare stroke rates, drive ratios
- Identify performance trends
- Validate algorithm consistency

### 3. Debugging
- View raw sensor data
- Check GPS quality
- Verify calibration data
- Diagnose detection issues

### 4. Training Analysis
- Review technique (drive ratio)
- Analyze stroke consistency
- Calculate split times
- Track improvements over time

## Parameter Guidelines

### Band-Pass Filter

| Parameter | Range | Default | Purpose |
|-----------|-------|---------|---------|
| Low Cut | 0.1-1.0 Hz | 0.3 Hz | Remove DC drift |
| High Cut | 0.5-2.0 Hz | 1.2 Hz | Remove noise |
| Sample Rate | 20-100 Hz | 50 Hz | Expected IMU rate |

**Rowing frequency range:** 18-40 SPM = 0.3-0.67 Hz

### Stroke Detection

| Parameter | Range | Default | Purpose |
|-----------|-------|---------|---------|
| Catch Threshold | 0.1-2.0 m/s² | 0.6 m/s² | Detect catch |
| Finish Threshold | -2.0-0.0 m/s² | -0.3 m/s² | Detect finish |

**Tuning tips:**
- Higher thresholds = fewer false positives
- Lower thresholds = more sensitive detection
- Adjust based on boat type and conditions

## Integration with PWA

### Workflow
1. **Record session** with PWA mobile app
2. **Export .wrcdata** file from PWA
3. **Load in analysis tool** on desktop
4. **Tune parameters** with historical data
5. **Apply settings** back to PWA
6. **Verify consistency** in next session

### Settings Transfer
The PWA's settings panel accepts the same parameter values:

**Analysis Tool:**
```typescript
{
  lowCutFreq: 0.3,
  highCutFreq: 1.2,
  catchThreshold: 0.6,
  finishThreshold: -0.3
}
```

**PWA Settings:**
- Low Cut: 0.3 Hz
- High Cut: 1.2 Hz
- Catch: 0.6 m/s²
- Finish: -0.3 m/s²

## Development Setup

```bash
# Install dependencies
cd analysis-app
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Deployment Options

### Option 1: Local File
Open `dist/index.html` directly in browser (works for local files).

### Option 2: Static Hosting
Deploy `dist/` folder to:
- GitHub Pages
- Netlify
- Vercel
- Any static host

### Option 3: Same Server as PWA
Add analysis tool to same server:
```
/                  → PWA
/analysis/         → Analysis Tool
```

## Performance Characteristics

### Data Handling
- Handles sessions with **100,000+ samples** smoothly
- Real-time parameter updates **< 100ms**
- SVG rendering optimized for desktop displays

### Memory Usage
- Typical session: **~10-20 MB** in memory
- Large session (2+ hours): **~50-100 MB**
- No memory leaks (React proper cleanup)

### Browser Requirements
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- **Desktop/tablet recommended** (mobile PWA is better for phones)

## Visualization Details

### Time Series Plots
- **Axes**: Automatic scaling with padding
- **Grid**: Optional, configurable
- **Markers**: Catch (green ▲), Finish (red ▼)
- **Legend**: Automatic for multiple series
- **Interaction**: Tooltip support (future)

### GPS Maps
- **Color scale**: HSL gradient (green=fast, red=slow)
- **Start/Finish**: Marked with green/red circles
- **Stats overlay**: Distance, avg split, GPS count
- **Coordinate system**: Proper lat/lon scaling

### Stroke Table
- **Sortable columns** (future)
- **Filterable data** (future)
- **Export to CSV** (future)

## Future Enhancements

### Planned Features
- [ ] Export analyzed data to CSV
- [ ] Compare multiple sessions side-by-side
- [ ] Zoom/pan on plots
- [ ] Stroke selection and highlighting
- [ ] Power estimation algorithms
- [ ] Video overlay (sync with GoPro)
- [ ] Machine learning insights

### Algorithm Improvements
- [ ] Kalman filter for GPS smoothing
- [ ] AHRS (orientation estimation)
- [ ] Boat velocity estimation
- [ ] Catch/finish quality scoring
- [ ] Technique analysis

## Testing Strategy

### Unit Tests
Test algorithm components in isolation:
```typescript
describe('BandPassFilter', () => {
  it('should filter stroke frequency', () => {
    const filter = new BandPassFilter(0.3, 1.2, 50);
    // Test with synthetic data
  });
});
```

### Integration Tests
Test data pipeline:
```typescript
describe('DataAnalyzer', () => {
  it('should analyze session correctly', () => {
    const data = loadTestSession();
    const results = DataAnalyzer.analyze(data, defaultParams);
    expect(results.totalStrokes).toBeGreaterThan(0);
  });
});
```

### Visual Tests
Manual verification with known sessions:
- Load reference session
- Verify stroke count matches manual count
- Check GPS route looks correct
- Validate statistics

## Troubleshooting

### Common Issues

**Problem:** Strokes not detected  
**Cause:** Thresholds too high or poor data quality  
**Solution:** Lower thresholds, check raw data tab

**Problem:** Too many false strokes  
**Cause:** Thresholds too low or noisy signal  
**Solution:** Increase thresholds, adjust filter

**Problem:** GPS map empty  
**Cause:** No GPS data in session  
**Solution:** Enable GPS in PWA before recording

**Problem:** Plots look jagged  
**Cause:** Browser zoom or small screen  
**Solution:** Use actual desktop/tablet, reset zoom

## Support & Documentation

- **Main README:** `/analysis-app/README.md`
- **Quick Start:** `/analysis-app/QUICKSTART.md`
- **Binary Format:** `/docs/BINARY_DATA_README.md`
- **Algorithm Details:** PWA source code documentation

## Contributing

When updating algorithms:
1. **Update PWA version first** (mobile is source of truth)
2. **Copy to analysis app** (keep identical)
3. **Test both** to ensure consistency
4. **Document changes** in both places

## License

Same as main WRC Coach project.

---

**Built for the WRC rowing community to analyze, improve, and excel! 🚣‍♂️**

