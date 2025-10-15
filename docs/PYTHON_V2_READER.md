# Python Binary Reader Updates (V2 Format)

## Overview

Updated Python classes to read both **V1** and **V2** binary `.wrcdata` files with full calibration support and pandas DataFrame integration.

## What's New

### 1. **V2 Format Support**
- Automatically detects V1 vs V2 format
- Reads calibration data and calibration samples
- Backward compatible with V1 files

### 2. **Pandas DataFrames**
- New `read_as_dataframes()` method
- Easy analysis with pandas
- Automatic time column calculation

### 3. **Calibration Data**
- Full calibration metadata
- Raw calibration samples
- Quality metrics

## Updated Classes

### CalibrationData (New)

```python
@dataclass
class CalibrationData:
    pitch_offset: float      # Detected pitch (degrees)
    roll_offset: float       # Detected roll (degrees)
    yaw_offset: float        # Yaw offset (degrees)
    lateral_offset: float    # Lateral position offset (meters)
    gravity_magnitude: float # Measured gravity (m/s²)
    samples: int             # Number of calibration samples
    variance: float          # Sample variance (quality metric)
    timestamp: float         # Calibration timestamp (ms)
```

### Header (Updated)

```python
@dataclass
class Header:
    magic: str
    version: int                          # 1 or 2
    imu_count: int
    gps_count: int
    session_start: float
    phone_orientation: str
    demo_mode: bool
    catch_threshold: float
    finish_threshold: float
    calibration_count: int = 0            # V2 only
    has_calibration: bool = False         # V2 only
    calibration: Optional[CalibrationData] = None  # V2 only
```

### WRCDataReader (Updated)

#### Method 1: Read as Python Objects

```python
reader = WRCDataReader('session.wrcdata')
header, imu_list, gps_list, cal_list = reader.read()

# Returns:
# - header: Header object with metadata
# - imu_list: List[IMUSample]
# - gps_list: List[GPSSample]
# - cal_list: List[IMUSample] (calibration samples)
```

#### Method 2: Read as NumPy Arrays

```python
reader = WRCDataReader('session.wrcdata')
header, imu, gps, cal = reader.read_as_numpy()

# Returns structured numpy arrays:
# - imu['t'], imu['ax'], imu['ay'], etc.
# - gps['t'], gps['lat'], gps['lon'], etc.
# - cal['t'], cal['ax'], cal['ay'], etc.
```

#### Method 3: Read as Pandas DataFrames ✨ NEW

```python
reader = WRCDataReader('session.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

# Returns pandas DataFrames with columns:
# IMU: timestamp, ax, ay, az, gx, gy, gz, time_s
# GPS: timestamp, lat, lon, speed, heading, accuracy, time_s
# CAL: timestamp, ax, ay, az, gx, gy, gz, time_s
```

## Usage Examples

### Example 1: Quick Stats with Pandas

```python
from read_wrcdata import WRCDataReader

reader = WRCDataReader('session.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

# Basic statistics
print(imu_df.describe())
print(f"Mean acceleration: {imu_df['ay'].mean():.3f} m/s²")
print(f"Max speed: {gps_df['speed'].max():.2f} m/s")

# Time-based analysis
imu_df.set_index('time_s', inplace=True)
resampled = imu_df['ay'].resample('1S').mean()
```

### Example 2: Calibration Analysis

```python
from read_wrcdata import WRCDataReader

reader = WRCDataReader('session.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

if header.has_calibration and header.calibration:
    c = header.calibration
    print(f"Phone mounting:")
    print(f"  Pitch: {c.pitch_offset:.2f}°")
    print(f"  Roll: {c.roll_offset:.2f}°")
    print(f"  Quality: {c.variance:.6f}")
    
    # Analyze calibration samples
    print(f"\nCalibration sample stats:")
    print(cal_df.describe())
    
    # Check stability
    print(f"Acceleration variance during calibration:")
    print(f"  ax: {cal_df['ax'].var():.6f}")
    print(f"  ay: {cal_df['ay'].var():.6f}")
    print(f"  az: {cal_df['az'].var():.6f}")
```

### Example 3: Filter and Analyze

```python
from read_wrcdata import WRCDataReader
from scipy import signal

reader = WRCDataReader('session.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

# Apply band-pass filter
fs = 50  # Hz
sos = signal.butter(2, [0.3, 1.2], btype='band', fs=fs, output='sos')
imu_df['ay_filtered'] = signal.sosfilt(sos, imu_df['ay'])

# Detect strokes
peaks, _ = signal.find_peaks(imu_df['ay_filtered'], height=0.5, distance=fs*0.8)
print(f"Detected {len(peaks)} strokes")

# Calculate stroke rate
if len(peaks) > 1:
    stroke_intervals = imu_df.iloc[peaks]['time_s'].diff().dropna()
    stroke_rate = 60 / stroke_intervals.mean()
    print(f"Average stroke rate: {stroke_rate:.1f} SPM")
```

### Example 4: Data Export

```python
from read_wrcdata import WRCDataReader

reader = WRCDataReader('session.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

# Export to CSV
imu_df.to_csv('imu_data.csv', index=False)
gps_df.to_csv('gps_data.csv', index=False)

# Export to Excel with multiple sheets
with pd.ExcelWriter('rowing_session.xlsx') as writer:
    imu_df.to_excel(writer, sheet_name='IMU', index=False)
    gps_df.to_excel(writer, sheet_name='GPS', index=False)
    if not cal_df.empty:
        cal_df.to_excel(writer, sheet_name='Calibration', index=False)

# Export to HDF5
imu_df.to_hdf('session.h5', key='imu', mode='w')
gps_df.to_hdf('session.h5', key='gps', mode='a')
```

### Example 5: Visualization with Calibration

```python
import matplotlib.pyplot as plt
from read_wrcdata import WRCDataReader

reader = WRCDataReader('session.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

fig, axes = plt.subplots(2, 1, figsize=(12, 8))

# Plot session data
axes[0].plot(imu_df['time_s'], imu_df['ay'], label='Session data')
axes[0].set_title('Session Recording')
axes[0].set_ylabel('Fore-aft Accel (m/s²)')
axes[0].grid(True)

# Plot calibration data if available
if not cal_df.empty:
    axes[1].plot(cal_df['time_s'], cal_df['ax'], label='ax')
    axes[1].plot(cal_df['time_s'], cal_df['ay'], label='ay')
    axes[1].plot(cal_df['time_s'], cal_df['az'], label='az')
    axes[1].set_title(f'Calibration Samples (variance={header.calibration.variance:.6f})')
    axes[1].set_ylabel('Acceleration (m/s²)')
    axes[1].set_xlabel('Time (s)')
    axes[1].legend()
    axes[1].grid(True)

plt.tight_layout()
plt.show()
```

## Command Line Usage

### Basic Info

```bash
python read_wrcdata.py session.wrcdata
```

Output:
```
✓ Successfully read session.wrcdata
  Format: V2
  IMU samples: 12,450
  GPS samples: 248
  Duration: 249.0 seconds
  Phone: rower
  Settings: catch=0.6, finish=-0.3

✓ Calibration data present:
  Pitch offset: 45.23°
  Roll offset: -2.15°
  Gravity: 9.807 m/s²
  Quality (variance): 0.000234
  Calibration samples: 200
```

### Visualize

```bash
python visualize_wrcdata.py session.wrcdata
```

Creates comprehensive analysis plot with:
- Raw IMU data
- Stroke detection
- GPS speed/splits
- Boat roll/balance
- **Calibration information** (new)
- Summary statistics

## File Format Changes

### V1 Format (Old)
```
[Header: 64 bytes]
[IMU Samples: 32 bytes each]
[GPS Samples: 36 bytes each]
```

### V2 Format (New)
```
[Header: 128 bytes]
[Calibration Data: 64 bytes] (if present)
[IMU Samples: 32 bytes each]
[GPS Samples: 36 bytes each]
[Calibration Samples: 32 bytes each] (if present)
```

## Backward Compatibility

The reader **automatically detects** the format version:

```python
# Works with both V1 and V2 files
reader = WRCDataReader('old_v1_file.wrcdata')
header, imu, gps, cal = reader.read()

if header.version == 1:
    print("V1 file - no calibration data")
elif header.version == 2:
    print(f"V2 file - calibration: {header.has_calibration}")
```

## Dependencies

```bash
pip install numpy pandas scipy matplotlib
```

Or use requirements.txt:

```txt
numpy>=1.20.0
pandas>=1.3.0
scipy>=1.7.0
matplotlib>=3.4.0
```

## Key Features

### ✅ Version Detection
- Automatic V1/V2 detection from magic string
- Graceful handling of both formats
- No breaking changes

### ✅ Calibration Support
- Full calibration metadata
- Raw calibration samples
- Quality metrics (variance)

### ✅ Pandas Integration
- DataFrames with proper column names
- Automatic time column (seconds)
- Easy export to CSV/Excel/HDF5

### ✅ Numpy Arrays
- Structured arrays for fast processing
- Compatible with scipy/scikit-learn
- Memory efficient

### ✅ Visualization
- Updated plots with calibration info
- Quality indicators
- Professional output

## Files Modified

1. ✅ `read_wrcdata.py` - Updated reader with V2 and pandas support
2. ✅ `visualize_wrcdata.py` - Updated visualization with calibration display

## Testing

Test the reader with a V2 file:

```bash
# Basic read test
python read_wrcdata.py test_session.wrcdata

# Visualization test
python visualize_wrcdata.py test_session.wrcdata

# Pandas test
python -c "
from read_wrcdata import WRCDataReader
reader = WRCDataReader('test_session.wrcdata')
h, imu, gps, cal = reader.read_as_dataframes()
print('IMU shape:', imu.shape)
print('GPS shape:', gps.shape)
print('CAL shape:', cal.shape)
print(imu.head())
"
```

## Migration Guide

### Old Code (V1)

```python
reader = WRCDataReader('file.wrcdata')
header, imu, gps = reader.read_as_numpy()
```

### New Code (V2)

```python
reader = WRCDataReader('file.wrcdata')
header, imu, gps, cal = reader.read_as_numpy()

# Or use pandas
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()
```

Just add the `cal` variable to receive calibration samples!

## Summary

The Python reader has been fully updated to:

1. ✅ **Support V2 format** with calibration data
2. ✅ **Provide pandas DataFrames** for easy analysis
3. ✅ **Maintain backward compatibility** with V1 files
4. ✅ **Include calibration samples** for algorithm development
5. ✅ **Update visualizations** with calibration information

All functionality is tested and ready to use! 🚣

