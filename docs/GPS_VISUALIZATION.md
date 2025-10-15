# GPS Visualization Guide

## Overview

Enhanced visualization tools to display GPS data on maps with speed-colored tracks.

## Visualization Options

### 1. Comprehensive Analysis (Static)

**Script:** `visualize_wrcdata.py`

Creates a multi-panel analysis plot **including GPS map**:

```bash
python visualize_wrcdata.py session.wrcdata
```

**Output:** `session_analysis.png`

**Features:**
- ✅ Raw IMU data (acceleration, gyroscope)
- ✅ Stroke detection with filtering
- ✅ Stroke rate over time
- ✅ GPS speed and split times
- ✅ Boat roll/balance
- ✅ **GPS route map with speed coloring** (NEW)
- ✅ Calibration information (V2)
- ✅ Summary statistics

**GPS Map Panel:**
- Route colored by speed (red=slow, green=fast)
- Start (green) and finish (red) markers
- Total distance calculation
- Speed colorbar
- Equal aspect ratio for accurate visualization

### 2. Interactive GPS Map (HTML)

**Script:** `create_gps_map.py`

Creates an **interactive HTML map** with full features:

```bash
python create_gps_map.py session.wrcdata [output.html]
```

**Output:** Interactive HTML file (default: `session_gps_map.html`)

**Features:**
- ✅ Interactive pan/zoom
- ✅ Multiple map layers (OpenStreetMap, Terrain, etc.)
- ✅ Route segments colored by speed
- ✅ Click on segments for speed/time info
- ✅ Start/finish markers with icons
- ✅ Statistics overlay panel
- ✅ Speed gradient legend
- ✅ Fullscreen mode
- ✅ Distance measurement tool
- ✅ Layer control

**Requirements:**
```bash
pip install folium
```

Falls back to matplotlib static map if folium not installed.

## GPS Map Features

### Speed Coloring

Routes are colored using a gradient:
- 🔴 **Red**: Slow speeds
- 🟡 **Yellow**: Medium speeds  
- 🟢 **Green**: Fast speeds

The color scale automatically adjusts to your session's speed range.

### Distance Calculation

Uses **Haversine formula** for accurate distance on a sphere:

```python
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # Earth radius in meters
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi/2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda/2)**2
    return 2 * R * np.arctan2(np.sqrt(a), np.sqrt(1-a))
```

Accurate for rowing distances (typically < 10 km).

### Statistics Displayed

**Static Map (matplotlib):**
- Total distance (meters and kilometers)
- Route visualization with speed coloring
- Start/finish markers

**Interactive Map (folium):**
- Total distance
- Duration
- Average speed (m/s and km/h)
- Max speed
- Average split time (/500m)
- GPS point count
- Phone orientation

## Usage Examples

### Example 1: Quick Static Visualization

```bash
# Generate comprehensive analysis with GPS map
python visualize_wrcdata.py my_session.wrcdata

# Opens: my_session_analysis.png
```

**Result:** 
- 8 panels including GPS route map
- All data in one image
- Ready for reports/presentations

### Example 2: Interactive Map

```bash
# Create interactive HTML map
python create_gps_map.py my_session.wrcdata

# Opens in browser: my_session_gps_map.html
```

**Result:**
- Interactive map you can pan/zoom
- Click segments for details
- Share HTML file with others

### Example 3: Custom Output

```bash
# Specify custom output filename
python create_gps_map.py my_session.wrcdata rowing_track.html
```

### Example 4: Programmatic Access

```python
from read_wrcdata import WRCDataReader
import matplotlib.pyplot as plt
from matplotlib.cm import get_cmap
from matplotlib.colors import Normalize

# Read GPS data
reader = WRCDataReader('session.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

# Plot custom GPS visualization
if not gps_df.empty:
    fig, ax = plt.subplots(figsize=(10, 8))
    
    # Color by speed
    cmap = get_cmap('RdYlGn')
    norm = Normalize(vmin=gps_df['speed'].min(), vmax=gps_df['speed'].max())
    
    # Plot route
    for i in range(len(gps_df)-1):
        ax.plot(
            [gps_df['lon'].iloc[i], gps_df['lon'].iloc[i+1]],
            [gps_df['lat'].iloc[i], gps_df['lat'].iloc[i+1]],
            color=cmap(norm(gps_df['speed'].iloc[i])),
            linewidth=2
        )
    
    # Markers
    ax.plot(gps_df['lon'].iloc[0], gps_df['lat'].iloc[0], 'go', markersize=10, label='Start')
    ax.plot(gps_df['lon'].iloc[-1], gps_df['lat'].iloc[-1], 'ro', markersize=10, label='Finish')
    
    ax.set_aspect('equal')
    ax.legend()
    plt.show()
```

## Map Tiles (Interactive Maps)

Available map styles in interactive maps:

1. **OpenStreetMap** (default) - Clear, detailed street maps
2. **Stamen Terrain** - Topographic with elevation shading
3. **Stamen Toner** - High contrast black/white
4. **CartoDB Positron** - Clean, light background

Switch between them using the layer control (top right).

## GPS Data Quality

### Checking GPS Quality

The visualization automatically handles:
- ✅ Missing GPS data (shows "No GPS data available")
- ✅ Zero coordinates (lat/lon = 0)
- ✅ Invalid positions

### Expected GPS Sample Rate

- **Typical:** 1 Hz (1 sample/second)
- **Display:** All points connected with segments
- **Accuracy:** Shown in comprehensive analysis

### Improving GPS Accuracy

For better maps:
1. Record in open areas (avoid buildings/trees)
2. Wait for GPS lock before starting
3. Keep phone screen on during recording
4. Use high-accuracy GPS mode

## Output Files

### Static Analysis (visualize_wrcdata.py)

**Output:** `session_analysis.png`

**Contains:**
1. Raw accelerometer (3 axes)
2. Raw gyroscope (3 axes)
3. Stroke detection (filtered signal)
4. Stroke rate over time
5. GPS speed/splits
6. Boat roll/balance
7. **GPS route map** ⭐
8. Summary statistics

### Interactive Map (create_gps_map.py)

**Output:** `session_gps_map.html`

**Features:**
- Standalone HTML file
- No internet required (except for map tiles)
- Share with anyone (just send the file)
- Open in any modern browser

## Advanced Features

### Segment Details (Interactive Map)

Click any route segment to see:
- Speed at that point (m/s and km/h)
- Time from start (MM:SS)
- Split time for that speed (sec/500m)

### Measurement Tool (Interactive Map)

1. Click the ruler icon (top left)
2. Click points on the map to measure distance
3. See cumulative distance
4. Double-click to finish

### Fullscreen Mode (Interactive Map)

Click the expand icon to view map fullscreen.

### Distance Calculation

Both static and interactive maps calculate total distance:

**Display Format:**
```
GPS Route Map (Total Distance: 2,458 m, 2.46 km)
```

## Customization

### Changing Color Scheme

Edit the colormap in the script:

```python
# Change from 'RdYlGn' to other colormaps:
cmap = get_cmap('viridis')  # Blue to yellow
cmap = get_cmap('plasma')   # Purple to yellow
cmap = get_cmap('coolwarm') # Blue to red
cmap = get_cmap('jet')      # Rainbow
```

### Adjusting Map Zoom (Interactive)

Change initial zoom level:

```python
m = folium.Map(
    location=[center_lat, center_lon],
    zoom_start=16,  # Higher = more zoomed in (default: 15)
    tiles='OpenStreetMap'
)
```

### Route Width

Adjust line thickness:

**Static (matplotlib):**
```python
linewidth=5  # Make thicker
```

**Interactive (folium):**
```python
weight=8  # Make thicker (default: 5)
```

## Troubleshooting

### No GPS Data Shown

**Problem:** Map shows "No GPS data available"

**Solutions:**
1. Check file has GPS data: `python read_wrcdata.py file.wrcdata`
2. Verify GPS was enabled during recording
3. Check GPS permissions in browser
4. Wait for GPS lock before recording

### Map Looks Distorted

**Problem:** Routes appear stretched or squashed

**Solutions:**
1. Static maps use `ax.set_aspect('equal')` for correct scaling
2. Interactive maps handle this automatically
3. Check coordinate validity (lat: -90 to 90, lon: -180 to 180)

### Interactive Map Won't Open

**Problem:** HTML file doesn't display

**Solutions:**
1. Check folium is installed: `pip install folium`
2. Try different browser
3. Check file permissions
4. Use fallback matplotlib map

### Colors Look Wrong

**Problem:** All one color or unexpected colors

**Solutions:**
1. Check speed data: `print(gps_df['speed'].describe())`
2. Verify speed range is reasonable
3. Try different colormap
4. Check for NaN values in speed data

## Dependencies

### Required (Both Methods)
```bash
pip install numpy matplotlib
```

### For Interactive Maps
```bash
pip install folium
```

### Full Installation
```bash
pip install numpy pandas matplotlib scipy folium
```

Or use requirements:
```bash
pip install -r requirements.txt
```

## Example Output

### Static Map Features
- Speed gradient along route
- Distance in title
- Start (green circle) / Finish (red circle)
- Colorbar showing speed scale
- Equal aspect ratio
- Grid overlay

### Interactive Map Features
- Pan: Click and drag
- Zoom: Scroll wheel or +/- buttons
- Popup: Click route segments
- Stats: Top right panel
- Legend: Bottom left
- Layers: Top right control
- Fullscreen: Expand button
- Measure: Ruler tool

## Integration with Analysis

GPS maps work seamlessly with other analysis:

```bash
# Complete workflow
python visualize_wrcdata.py session.wrcdata    # Static analysis
python create_gps_map.py session.wrcdata        # Interactive map
python test_pandas_reader.py session.wrcdata    # Data export
```

**Result:**
1. `session_analysis.png` - Complete static analysis
2. `session_gps_map.html` - Interactive GPS map  
3. `session_imu.csv` - Exported IMU data
4. `session_gps.csv` - Exported GPS data

## Performance

### Static Maps (matplotlib)
- **Speed:** Very fast (< 1 second)
- **File size:** ~500 KB PNG
- **Works offline:** Yes

### Interactive Maps (folium)
- **Speed:** Fast (1-2 seconds)
- **File size:** ~100 KB HTML
- **Works offline:** Map tiles need internet

### Large Sessions

For sessions with many GPS points (> 1000):
- Static maps: No performance impact
- Interactive maps: May be slightly slower to load
- Consider reducing point density for very long sessions

## Summary

You now have **two powerful ways** to visualize GPS data:

1. **✅ Static Analysis** (`visualize_wrcdata.py`)
   - Comprehensive multi-panel plot
   - GPS map included
   - Ready for reports

2. **✅ Interactive Map** (`create_gps_map.py`)  
   - HTML map with full interactivity
   - Click for details
   - Share with others

Both methods:
- Color routes by speed
- Calculate distances accurately
- Show start/finish markers
- Work with V1 and V2 formats

**Happy mapping! 🗺️🚣**

