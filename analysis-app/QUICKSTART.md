# Quick Start Guide

## Installation

```bash
cd analysis-app
npm install
```

## Run Development Server

```bash
npm run dev
```

Open http://localhost:3001

## Usage

1. **Load Data**: Click "📁 Load .wrcdata File" and select your exported session
2. **View Overview**: See session summary and stroke detection
3. **Tune Parameters**: Adjust filters and thresholds in the left panel
4. **Analyze**: Switch between tabs to explore different visualizations
5. **Export Settings**: Copy your tuned parameters to use in the PWA app

## Tabs Explained

- **📊 Overview**: Session stats + stroke detection visualization
- **🎯 Stroke Analysis**: Stroke-by-stroke table with detailed metrics
- **🗺️ GPS Map**: Route with speed coloring
- **📈 Raw Data**: All sensor data (accelerometer, gyro, GPS)

## Parameter Tuning Tips

### Band-Pass Filter
- **Low Cut (0.3 Hz)**: Removes slow drift
- **High Cut (1.2 Hz)**: Removes fast noise
- Rowing strokes are typically 18-40 SPM (0.3-0.67 Hz)

### Stroke Detection
- **Catch Threshold (0.6 m/s²)**: Higher = fewer false catches
- **Finish Threshold (-0.3 m/s²)**: Lower = more sensitive finish detection

### Presets
- **Default**: Standard rowing conditions
- **Sensitive**: Rough water or lighter boats
- **Relaxed**: Calm water or heavier boats

## Keyboard Shortcuts

- `1-4`: Switch between tabs
- `Cmd/Ctrl + O`: Open file (when browser focused on button)

## Exporting .wrcdata Files

From the WRC Coach PWA mobile app:
1. Complete a rowing session
2. Click "Export CSV" button
3. Both `.csv` and `.wrcdata` files are downloaded
4. Transfer `.wrcdata` file to your computer
5. Load it in this analysis tool

## Algorithm Consistency

The algorithms in this tool are **identical** to the PWA:
- Same BandPassFilter implementation
- Same StrokeDetector logic
- Same parameter ranges

This means you can:
1. Tune parameters with historical data here
2. Apply the same values in the PWA settings
3. Get consistent stroke detection during rowing

## Building for Production

```bash
npm run build
```

Static files will be in `dist/` directory.

## Troubleshooting

**Problem**: File won't load  
**Solution**: Ensure it's a `.wrcdata` file from WRC Coach PWA

**Problem**: No strokes detected  
**Solution**: Lower catch/finish thresholds or check raw data quality

**Problem**: Too many false strokes  
**Solution**: Increase catch/finish thresholds

**Problem**: GPS map is empty  
**Solution**: Session may have no GPS data (indoor rowing or GPS disabled)

## Need Help?

See full README.md for detailed documentation.

