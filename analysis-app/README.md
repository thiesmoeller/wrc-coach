# WRC Coach - Data Analysis Tool

A desktop/tablet-optimized web application for analyzing rowing data from the WRC Coach PWA. This tool allows you to load `.wrcdata` files, visualize sensor data, tune algorithms, and analyze rowing performance in detail.

## Features

### 📊 Comprehensive Visualizations
- **Time-series plots** for IMU sensor data (accelerometer & gyroscope)
- **GPS route maps** with speed-based coloring
- **Stroke detection** visualization with catch/finish markers
- **Interactive plots** built with SVG for sharp rendering on any screen

### 🎯 Algorithm Tuning
- **Real-time parameter adjustment** for filters and stroke detection
- **Identical algorithms** to the WRC Coach PWA - tune here, use there!
- **Preset configurations** for different rowing conditions
- **Live updates** - see results immediately as you adjust parameters

### 📈 Analysis Features
- Stroke-by-stroke metrics (rate, drive ratio, timing)
- Session statistics (distance, speed, splits)
- Data quality metrics
- Export capabilities for further analysis

### 🔧 Technical Features
- Uses the **exact same math routines** from the WRC Coach PWA
- No dependencies on external charting libraries
- Pure SVG-based graphics for performance
- Desktop and tablet optimized layout

## Getting Started

### Installation

```bash
cd analysis-app
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

### Building for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

## Usage

### 1. Load Data

Click **"📁 Load .wrcdata File"** and select a `.wrcdata` file exported from the WRC Coach PWA mobile app.

### 2. Explore Data

Navigate between tabs:
- **📊 Overview**: Session summary and stroke detection
- **🎯 Stroke Analysis**: Detailed stroke-by-stroke breakdown
- **🗺️ GPS Map**: Route visualization with speed coloring  
- **📈 Raw Data**: Raw sensor data plots

### 3. Tune Parameters

Use the **Algorithm Parameters** panel on the left to adjust:

#### Band-Pass Filter
- **Low Cut Frequency** (0.1-1.0 Hz): Removes DC drift and low-frequency noise
- **High Cut Frequency** (0.5-2.0 Hz): Removes high-frequency noise
- **Sample Rate** (20-100 Hz): Expected IMU sampling rate

#### Stroke Detection
- **Catch Threshold** (0.1-2.0 m/s²): Minimum acceleration to detect catch
- **Finish Threshold** (-2.0-0.0 m/s²): Maximum acceleration to detect finish

### 4. Apply Settings

Parameters update in real-time. When you find optimal settings, use the same values in the WRC Coach PWA for consistent stroke detection during rowing.

## Algorithm Details

This tool **shares the exact same algorithm code** with the WRC Coach PWA:

### Shared Architecture 🔗
- Algorithms live in `../src/lib/` (single source of truth)
- Both apps import from the same files
- **Zero code duplication** - update once, works everywhere
- **Guaranteed consistency** - impossible to get out of sync

### Filters
- `BandPassFilter` - Butterworth 2nd order (0.3-1.2 Hz default)
- `LowPassFilter` - Exponential smoothing
- `BaselineCorrector` - Recovery-phase drift compensation

### Stroke Detection
- `StrokeDetector` - Threshold-based catch/finish detection
- Drive ratio calculation
- Stroke rate computation (SPM)

### Data Format
- Binary `.wrcdata` reader supporting V1 and V2 formats
- Handles calibration data (V2)
- Compatible with all WRC Coach PWA exports

See `SHARED_ARCHITECTURE.md` for technical details on code sharing.

## File Format

The tool reads `.wrcdata` binary files with the following structure:

### V1 Format
- Header (64 bytes): metadata, sample counts, thresholds
- IMU samples (32 bytes each): timestamp, ax, ay, az, gx, gy, gz
- GPS samples (36 bytes each): timestamp, lat, lon, speed, heading, accuracy

### V2 Format (with calibration)
- Header (128 bytes): extended metadata
- Calibration data (64 bytes): pitch/roll offsets, gravity, quality metrics
- IMU samples (32 bytes each)
- GPS samples (36 bytes each)
- Calibration samples (32 bytes each)

See `docs/BINARY_DATA_README.md` in the main project for full format specification.

## Development

### Project Structure

```
wrc-coach/
├── src/lib/              # 🔗 SHARED ALGORITHMS (used by both apps)
│   ├── filters/          #    - BandPassFilter, LowPassFilter
│   ├── stroke-detection/ #    - StrokeDetector, BaselineCorrector
│   ├── data-storage/     #    - Shared types
│   └── transforms/       #    - BoatTransform
│
└── analysis-app/
    ├── src/
    │   ├── lib/          # Analysis-specific utilities
    │   │   ├── BinaryDataReader.ts
    │   │   └── DataAnalyzer.ts
    │   ├── components/   # UI components
    │   │   ├── TimeSeriesPlot.tsx
    │   │   ├── GPSMapPlot.tsx
    │   │   ├── ParameterPanel.tsx
    │   │   └── StatisticsPanel.tsx
    │   ├── types.ts      # TypeScript interfaces
    │   ├── App.tsx       # Main application
    │   └── main.tsx      # Entry point
    ├── index.html
    ├── package.json
    └── vite.config.ts    # Path aliases for shared code
```

### Key Components

#### TimeSeriesPlot
SVG-based time-series visualization with multiple data series, markers, grid, and legends.

#### GPSMapPlot
SVG-based GPS route map with speed-based coloring using HSL gradient (green=fast, red=slow).

#### ParameterPanel
Interactive controls for adjusting filter and detection parameters with real-time updates.

#### StatisticsPanel
Session summary with stroke metrics, performance stats, and data quality indicators.

## Why SVG Graphics?

- **Sharp on any display** - vector graphics scale perfectly
- **Lightweight** - no large charting library dependencies
- **Customizable** - full control over appearance
- **Fast** - direct rendering, no abstraction overhead
- **Interactive** - easy to add tooltips, zoom, pan later

## Integration with PWA

The analysis tool uses a **shared codebase** with the WRC Coach PWA:

### Single Source of Truth 🎯
- Algorithms are **not copied** - they're **imported** from `../src/lib/`
- Both apps use the exact same code files
- Update algorithm once → works in both apps automatically
- Zero risk of code drift or inconsistency

### Workflow
1. **Tune parameters here** using historical data
2. **Test different settings** to optimize detection
3. **Apply the same values** in the PWA mobile app
4. **Get consistent results** during live rowing sessions

### Benefits
- ✅ Fix a bug → fixed in both apps
- ✅ Optimize code → faster in both apps
- ✅ Add feature → available everywhere
- ✅ No manual syncing needed

See `SHARED_ARCHITECTURE.md` for technical details.

## Tips

### Optimizing Stroke Detection

- **Too many false positives?** Increase catch/finish thresholds
- **Missing strokes?** Decrease thresholds
- **Noisy signal?** Adjust band-pass filter cutoffs
- **Unstable baseline?** Check phone mounting and calibration

### Best Practices

- Load multiple sessions to compare settings
- Use the stroke table to verify detection accuracy
- Check raw data tab if detection seems off
- Export tuned parameters for documentation

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Performance

- Handles sessions with 100,000+ samples smoothly
- Real-time parameter updates (< 100ms analysis time)
- Optimized SVG rendering for desktop displays

## Troubleshooting

### File won't load
- Ensure file has `.wrcdata` extension
- Check that file is from WRC Coach PWA export
- Verify file is not corrupted (> 0 bytes)

### Plots look wrong
- Check that data contains valid samples
- Verify GPS coordinates are present (for map)
- Try adjusting plot time ranges

### Stroke detection inaccurate
- Review catch/finish thresholds
- Check filter parameters
- View raw data to diagnose signal quality

## License

Same as the main WRC Coach project.

## Support

For issues or questions, see the main WRC Coach project documentation or open an issue on GitHub.

---

**Built with ❤️ for the WRC rowing community**

