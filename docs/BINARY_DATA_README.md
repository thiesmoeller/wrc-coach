# WRC Coach Binary Data Format (.wrcdata)

## Overview

The `.wrcdata` format is a compact binary storage format for rowing sensor data. It's designed for efficient storage and fast reprocessing when developing new visualization algorithms.

**Current Version:** V2 (includes calibration data)  
**Backward Compatible:** Yes, supports both V1 and V2 formats

## Quick Start

### Recording Data

1. **Record a session** in the WRC Coach PWA
2. **Click "Export CSV"** - This now exports BOTH formats:
   - `stroke_coach_YYYY-MM-DD.csv` - Human-readable
   - `stroke_coach_YYYY-MM-DD.wrcdata` - Compact binary

### Reading Data (Python)

#### NumPy Arrays (Fast Processing)

```python
from read_wrcdata import WRCDataReader

# Read data
reader = WRCDataReader('stroke_coach_2025-10-14.wrcdata')
header, imu, gps, cal = reader.read_as_numpy()

# Access data
print(f"Format: V{header.version}")
print(f"IMU samples: {len(imu)}")
print(f"Acceleration: {imu['ay']}")  # Fore-aft
print(f"GPS speed: {gps['speed']}")

# Calibration data (V2)
if header.has_calibration:
    print(f"Pitch: {header.calibration.pitch_offset:.1f}°")
    print(f"Calibration samples: {len(cal)}")
```

#### Pandas DataFrames (Easy Analysis) ✨ NEW

```python
from read_wrcdata import WRCDataReader

# Read as DataFrames
reader = WRCDataReader('stroke_coach_2025-10-14.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

# Easy analysis with pandas
print(imu_df.describe())
print(f"Mean speed: {gps_df['speed'].mean():.2f} m/s")

# Export to CSV/Excel
imu_df.to_csv('imu_data.csv')
```

### Visualizing Data

```bash
python visualize_wrcdata.py stroke_coach_2025-10-14.wrcdata
```

Creates comprehensive analysis plot with:
- Raw IMU data
- Stroke detection
- Stroke rate analysis
- GPS speed/splits
- Boat roll/balance
- Summary statistics

## File Format Details

### V2 Structure (Current)

```
┌─────────────────────┐
│ Header (128 B)      │ - Magic "WRC_COACH_V2", metadata, settings
├─────────────────────┤
│ Calibration (64 B)  │ - Pitch/roll offsets, quality (if calibrated)
├─────────────────────┤
│ IMU Samples         │ - 32 bytes each
│  × N samples        │
├─────────────────────┤
│ GPS Samples         │ - 36 bytes each
│  × M samples        │
├─────────────────────┤
│ Cal Samples         │ - 32 bytes each (raw calibration data)
│  × C samples        │
└─────────────────────┘
```

### V1 Structure (Legacy)

```
┌─────────────────┐
│ Header (64 B)   │ - Magic "WRC_COACH_V1", metadata
├─────────────────┤
│ IMU Samples     │ - 32 bytes each
│  × N samples    │
├─────────────────┤
│ GPS Samples     │ - 36 bytes each
│  × M samples    │
└─────────────────┘
```

### Header (128 bytes in V2, 64 bytes in V1)

#### V2 Header

| Offset | Type     | Field             | Description                    |
|--------|----------|-------------------|--------------------------------|
| 0      | char[16] | Magic             | "WRC_COACH_V2\0\0\0\0\0"      |
| 16     | uint32   | IMU count         | Number of IMU samples          |
| 20     | uint32   | GPS count         | Number of GPS samples          |
| 24     | uint32   | Cal count         | Number of calibration samples  |
| 28     | uint8    | Has calibration   | 1=calibrated, 0=not           |
| 29     | float64  | Session start     | Unix timestamp (ms)            |
| 37     | uint8    | Phone orientation | 0=rower, 1=coxswain           |
| 38     | uint8    | Demo mode         | 0=real, 1=demo                |
| 39     | float32  | Catch threshold   | Acceleration threshold (m/s²)  |
| 43     | float32  | Finish threshold  | Acceleration threshold (m/s²)  |
| 47     | byte[81] | Reserved          | For future use                 |

### Calibration Data (64 bytes, V2 only)

| Offset | Type    | Field             | Description                    |
|--------|---------|-------------------|--------------------------------|
| 0      | float32 | Pitch offset      | Detected pitch angle (degrees) |
| 4      | float32 | Roll offset       | Detected roll angle (degrees)  |
| 8      | float32 | Yaw offset        | Yaw angle (degrees)            |
| 12     | float32 | Lateral offset    | Position offset (meters)       |
| 16     | float32 | Gravity magnitude | Measured gravity (m/s²)        |
| 20     | uint32  | Sample count      | Number of calibration samples  |
| 24     | float32 | Variance          | Quality metric                 |
| 28     | float64 | Timestamp         | Calibration time (ms)          |
| 36     | byte[28]| Reserved          | For future use                 |

### IMU Sample (32 bytes)

| Offset | Type    | Field | Unit  | Description        |
|--------|---------|-------|-------|--------------------|
| 0      | float64 | t     | ms    | Timestamp          |
| 8      | float32 | ax    | m/s²  | Lateral accel      |
| 12     | float32 | ay    | m/s²  | Fore-aft accel     |
| 16     | float32 | az    | m/s²  | Vertical accel     |
| 20     | float32 | gx    | deg/s | Roll rate          |
| 24     | float32 | gy    | deg/s | Pitch rate         |
| 28     | float32 | gz    | deg/s | Yaw rate           |

### GPS Sample (36 bytes)

| Offset | Type    | Field    | Unit    | Description        |
|--------|---------|----------|---------|-------------------|
| 0      | float64 | t        | ms      | Timestamp         |
| 8      | float64 | lat      | degrees | Latitude          |
| 16     | float64 | lon      | degrees | Longitude         |
| 24     | float32 | speed    | m/s     | Ground speed      |
| 28     | float32 | heading  | degrees | Course heading    |
| 32     | float32 | accuracy | meters  | Position accuracy |

## File Size Comparison

### 1 Hour Session @ 24 SPM

| Format   | Size    | Compression | Notes                  |
|----------|---------|-------------|------------------------|
| CSV      | ~18 MB  | 1.0×        | Human-readable         |
| .wrcdata | ~6 MB   | 0.33×       | Binary, fast parsing   |
| .wrcdata.gz | ~2-3 MB | 0.15×    | Gzip compressed        |

### Why Binary?

✅ **70% smaller** than CSV  
✅ **10-50× faster** to parse  
✅ **No precision loss** (float → string → float)  
✅ **Type-safe** access  
✅ **Streamable** (append without rewriting)  

## Python API Reference

### WRCDataReader

```python
class WRCDataReader:
    def __init__(self, filepath: str)
    
    def read(self) -> Tuple[Header, List[IMUSample], List[GPSSample], List[IMUSample]]
        """Read entire file as Python objects
        Returns: (header, imu_samples, gps_samples, calibration_samples)"""
    
    def read_as_numpy(self) -> Tuple[Header, np.ndarray, np.ndarray, np.ndarray]
        """Read as numpy arrays (fast!)
        Returns: (header, imu_array, gps_array, cal_array)"""
    
    def read_as_dataframes(self) -> Tuple[Header, pd.DataFrame, pd.DataFrame, pd.DataFrame]
        """Read as pandas DataFrames (easy analysis!)
        Returns: (header, imu_df, gps_df, cal_df)"""
```

### Data Classes

```python
@dataclass
class Header:
    magic: str
    version: int                          # 1 or 2
    imu_count: int
    gps_count: int
    session_start: float
    phone_orientation: str                # 'rower' or 'coxswain'
    demo_mode: bool
    catch_threshold: float
    finish_threshold: float
    calibration_count: int = 0            # V2 only
    has_calibration: bool = False         # V2 only
    calibration: Optional[CalibrationData] = None  # V2 only

@dataclass
class CalibrationData:                    # V2 only
    pitch_offset: float                   # Detected pitch (degrees)
    roll_offset: float                    # Detected roll (degrees)
    yaw_offset: float                     # Yaw offset (degrees)
    lateral_offset: float                 # Lateral offset (meters)
    gravity_magnitude: float              # Measured gravity (m/s²)
    samples: int                          # Number of calibration samples
    variance: float                       # Sample variance (quality)
    timestamp: float                      # Calibration timestamp (ms)

@dataclass
class IMUSample:
    timestamp: float  # ms
    ax: float  # m/s²
    ay: float
    az: float
    gx: float  # deg/s
    gy: float
    gz: float

@dataclass
class GPSSample:
    timestamp: float  # ms
    lat: float  # degrees
    lon: float
    speed: float  # m/s
    heading: float  # degrees
    accuracy: float  # meters
```

## Example Use Cases

### 1. Stroke Detection Algorithm Development

```python
from read_wrcdata import WRCDataReader
from scipy import signal

reader = WRCDataReader('session.wrcdata')
header, imu, gps = reader.read_as_numpy()

# Extract fore-aft acceleration
ay = imu['ay']

# Design new filter
sos = signal.butter(3, [0.2, 1.5], btype='band', fs=50, output='sos')
filtered = signal.sosfilt(sos, ay)

# Test new thresholds
catches, _ = signal.find_peaks(filtered, height=0.8, distance=40)
print(f"Detected {len(catches)} strokes")
```

### 2. GPS Smoothing

```python
from scipy.ndimage import gaussian_filter1d

# Smooth GPS speed
smoothed_speed = gaussian_filter1d(gps['speed'], sigma=2)

# Calculate smoothed splits
splits = 500 / smoothed_speed  # seconds per 500m
```

### 3. Orientation Estimation

```python
# Implement Madgwick or Mahony AHRS
from ahrs import Madgwick

mw = Madgwick(frequency=50)
quaternions = []

for i in range(len(imu)):
    q = mw.updateIMU(
        [imu['gx'][i], imu['gy'][i], imu['gz'][i]],
        [imu['ax'][i], imu['ay'][i], imu['az'][i]]
    )
    quaternions.append(q)
```

### 4. Machine Learning Training Data

```python
# Read directly as DataFrames (V2 method)
reader = WRCDataReader('session.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

# Extract features
features = {
    'stroke_rate': calculate_stroke_rate(imu_df),
    'drive_ratio': calculate_drive_ratio(imu_df),
    'power': estimate_power(imu_df, gps_df),
    'technique_score': score_technique(imu_df)
}

# Include calibration quality
if header.has_calibration:
    features['calibration_variance'] = header.calibration.variance
    features['mounting_pitch'] = header.calibration.pitch_offset
```

### 5. Pandas Analysis with Calibration

```python
# Read V2 file with calibration
reader = WRCDataReader('session.wrcdata')
header, imu_df, gps_df, cal_df = reader.read_as_dataframes()

# Analyze calibration quality
if not cal_df.empty:
    print("Calibration variance:")
    print(cal_df[['ax', 'ay', 'az']].var())
    
    # Check for motion during calibration
    motion = cal_df[['ax', 'ay', 'az']].std().mean()
    print(f"Average motion: {motion:.6f} m/s²")
    
# Resample to fixed intervals
imu_df.set_index('time_s', inplace=True)
imu_1hz = imu_df.resample('1S').mean()

# Export analysis
imu_df.to_csv('processed_imu.csv')
```

## JavaScript API (Browser)

### Writing Binary Data

```javascript
// Already integrated in WRC Coach app
const writer = new BinaryDataWriter();
const buffer = writer.encode(imuSamples, gpsSamples, metadata);

// Download
const blob = new Blob([buffer], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);
// ... trigger download
```

### Reading Binary Data

```javascript
const reader = new BinaryDataReader();

// From file input
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    file.arrayBuffer().then(buffer => {
        const { metadata, imuSamples, gpsSamples } = reader.decode(buffer);
        console.log(`Loaded ${imuSamples.length} IMU samples`);
        // Reprocess with new algorithms...
    });
});
```

## File Validation

```python
def validate_wrcdata(filepath):
    """Validate .wrcdata file integrity"""
    try:
        reader = WRCDataReader(filepath)
        header, imu, gps = reader.read()
        
        # Check counts match
        assert len(imu) == header.imu_count, "IMU count mismatch"
        assert len(gps) == header.gps_count, "GPS count mismatch"
        
        # Check timestamps are monotonic
        assert all(imu[i].timestamp <= imu[i+1].timestamp 
                  for i in range(len(imu)-1)), "Non-monotonic IMU timestamps"
        
        print(f"✓ Valid .wrcdata file")
        return True
    except Exception as e:
        print(f"✗ Invalid file: {e}")
        return False
```

## Tools Included

### read_wrcdata.py
Python reader with numpy support. Fast data loading for analysis.

```bash
python read_wrcdata.py session.wrcdata
```

### visualize_wrcdata.py
Create comprehensive analysis plots.

```bash
python visualize_wrcdata.py session.wrcdata
```

Generates multi-panel figure with:
- Raw sensor data
- Filtered signals
- Stroke detection
- Performance metrics
- GPS tracking
- Summary statistics

## Future Extensions

The format includes 22 reserved bytes in the header for future features:

**Potential additions:**
- Boat type (1x, 2x, 4x, 8+)
- Crew member count
- Water conditions
- Temperature
- Calibration offsets
- Filter coefficients
- Session notes (offset to string table)

## Converting to Other Formats

### To CSV

```python
import pandas as pd

header, imu, gps = reader.read_as_numpy()

df_imu = pd.DataFrame(imu)
df_imu['type'] = 'imu'

df_gps = pd.DataFrame(gps)
df_gps['type'] = 'gps'

# Merge and save
df = pd.concat([df_imu, df_gps], sort=False)
df.to_csv('output.csv', index=False)
```

### To HDF5

```python
import h5py

with h5py.File('session.h5', 'w') as f:
    # Metadata
    f.attrs['session_start'] = header.session_start
    f.attrs['phone_orientation'] = header.phone_orientation
    
    # Data
    f.create_dataset('imu', data=imu, compression='gzip')
    f.create_dataset('gps', data=gps, compression='gzip')
```

## License

Format specification and reference implementation are open source.
See main project LICENSE file.

## Support

For issues or questions:
- Open an issue on GitHub
- Check FILTERING_IMPROVEMENTS.md for algorithm details
- See CAPROVER_DEPLOYMENT.md for hosting

---

**Happy rowing data analysis! 🚣**

