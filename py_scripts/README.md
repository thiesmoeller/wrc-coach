# Python Scripts for WRC Coach

Python utilities for analyzing and visualizing WRC Coach session data.

## Requirements

```bash
# Using uv (recommended)
uv pip install pandas numpy matplotlib

# Or using pip
pip install pandas numpy matplotlib
```

## Scripts

### 1. `read_wrcdata.py`
Read and parse binary `.wrcdata` files.

**Usage:**
```bash
python read_wrcdata.py session_file.wrcdata
```

**Features:**
- Parses binary format (V2)
- Extracts IMU and GPS samples
- Displays session metadata
- Shows calibration data (if available)

### 2. `visualize_wrcdata.py`
Comprehensive visualization of session data.

**Usage:**
```bash
python visualize_wrcdata.py session_file.wrcdata
```

**Generates:**
- Stroke cycle analysis
- Acceleration patterns
- GPS track visualization
- Speed over time
- Stroke rate analysis
- Drive/Recovery phases

**Output:** Opens interactive matplotlib plots

### 3. `create_gps_map.py`
Create interactive GPS maps from session data.

**Usage:**
```bash
python create_gps_map.py session_file.wrcdata
```

**Features:**
- Interactive Leaflet map
- Color-coded speed visualization
- Stroke markers
- Session statistics overlay
- Exports to HTML file

**Output:** `[session_name]_map.html`

### 4. `test_binary_format.py`
Test and validate binary data format.

**Usage:**
```bash
python test_binary_format.py
```

**Purpose:**
- Validate binary format implementation
- Test encoding/decoding
- Check data integrity
- Format specification testing

### 5. `test_pandas_reader.py`
Test pandas-based data reading utilities.

**Usage:**
```bash
python test_pandas_reader.py session_file.wrcdata
```

**Purpose:**
- Test pandas DataFrame conversion
- Validate data structures
- Performance testing
- Data analysis workflows

## Common Workflows

### Quick Session Analysis
```bash
# View session data structure
python read_wrcdata.py my_session.wrcdata

# Generate visualizations
python visualize_wrcdata.py my_session.wrcdata

# Create GPS map
python create_gps_map.py my_session.wrcdata
```

### Batch Analysis
```bash
# Process all sessions in folder
for file in *.wrcdata; do
  python visualize_wrcdata.py "$file"
  python create_gps_map.py "$file"
done
```

### Export to CSV
```python
# Using read_wrcdata.py as module
from read_wrcdata import read_wrcdata
import pandas as pd

# Read session
data = read_wrcdata('session.wrcdata')

# Convert to DataFrame
df_imu = pd.DataFrame(data['imu_samples'])
df_gps = pd.DataFrame(data['gps_samples'])

# Export
df_imu.to_csv('imu_data.csv', index=False)
df_gps.to_csv('gps_data.csv', index=False)
```

## Data Format

### Binary Format (.wrcdata)
Custom binary format optimized for:
- Compact storage
- Fast reading
- Preserves precision
- Includes metadata

**Structure:**
- Header (magic bytes, version)
- Metadata (session info, settings)
- IMU samples (accelerometer, gyroscope)
- GPS samples (position, speed)
- Calibration data (optional)

See `docs/BINARY_DATA_README.md` for full specification.

## Troubleshooting

### Import Errors
```bash
# Install missing packages
pip install -r requirements.txt  # if exists
# or
pip install pandas numpy matplotlib
```

### File Not Found
```bash
# Check file path
ls -la *.wrcdata

# Use absolute path
python read_wrcdata.py /full/path/to/session.wrcdata
```

### Visualization Not Showing
```bash
# If plots don't appear, use interactive backend
export MPLBACKEND=TkAgg
python visualize_wrcdata.py session.wrcdata
```

### GPS Map Not Opening
```bash
# Check output file created
ls -la *_map.html

# Open manually
open session_map.html  # macOS
xdg-open session_map.html  # Linux
start session_map.html  # Windows
```

## Development

### Running Tests
```bash
# Test binary format
python test_binary_format.py

# Test pandas reader
python test_pandas_reader.py test_data.wrcdata
```

### Adding New Scripts
1. Follow naming convention: `action_description.py`
2. Include usage instructions in docstring
3. Add error handling for file I/O
4. Test with various session files
5. Update this README

## Integration with PWA

These scripts analyze data exported from the PWA:
1. Record session in PWA
2. Click **Share** button
3. Save `.wrcdata` file
4. Transfer to computer
5. Run analysis scripts

No data leaves your device until you explicitly export!

## Notes

- Scripts are designed for offline analysis
- Not included in PWA deployment
- For use on desktop/laptop
- Compatible with Python 3.8+

---

For more information, see:
- `docs/PYTHON_V2_READER.md` - Binary format details
- `docs/GPS_VISUALIZATION.md` - GPS visualization guide
- `docs/STORAGE_AND_SHARING.md` - Data export guide

