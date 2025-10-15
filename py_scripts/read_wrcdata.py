#!/usr/bin/env python3
"""
WRC Coach Binary Data Reader
Reads .wrcdata files (V1 and V2) for post-processing and algorithm development
Supports pandas DataFrames for easy analysis
"""

import struct
import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict
from pathlib import Path


@dataclass
class CalibrationData:
    """Phone calibration data (V2 only)"""
    pitch_offset: float      # Detected pitch (degrees)
    roll_offset: float       # Detected roll (degrees)
    yaw_offset: float        # Yaw offset (degrees)
    lateral_offset: float    # Lateral position offset (meters)
    gravity_magnitude: float # Measured gravity (m/s²)
    samples: int             # Number of calibration samples
    variance: float          # Sample variance (quality metric)
    timestamp: float         # Calibration timestamp (ms)


@dataclass
class Header:
    magic: str
    version: int                      # 1 or 2
    imu_count: int
    gps_count: int
    session_start: float
    phone_orientation: str            # 'rower' or 'coxswain'
    demo_mode: bool
    catch_threshold: float
    finish_threshold: float
    calibration_count: int = 0        # V2 only
    has_calibration: bool = False     # V2 only
    calibration: Optional[CalibrationData] = None  # V2 only


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


class WRCDataReader:
    """Reader for .wrcdata binary files (V1 and V2)"""
    
    MAGIC_V1 = b'WRC_COACH_V1'
    MAGIC_V2 = b'WRC_COACH_V2'
    HEADER_SIZE_V1 = 64
    HEADER_SIZE_V2 = 128
    IMU_SAMPLE_SIZE = 32
    GPS_SAMPLE_SIZE = 36
    CALIBRATION_SIZE = 64
    
    def __init__(self, filepath: str):
        self.filepath = Path(filepath)
        
    def read(self) -> Tuple[Header, List[IMUSample], List[GPSSample], List[IMUSample]]:
        """Read entire file - returns (header, imu_samples, gps_samples, calibration_samples)"""
        with open(self.filepath, 'rb') as f:
            data = f.read()
        
        offset = 0
        
        # Detect version from magic string
        magic = data[0:16].rstrip(b'\x00').decode('ascii')
        if magic.startswith('WRC_COACH_V2'):
            version = 2
        elif magic.startswith('WRC_COACH_V1'):
            version = 1
        else:
            raise ValueError(f'Invalid file format: {magic}')
        
        # Read header
        header = self._read_header(data, offset, version)
        offset += self.HEADER_SIZE_V2 if version == 2 else self.HEADER_SIZE_V1
        
        # Read calibration data if V2 and present
        if version == 2 and header.has_calibration:
            calibration = self._read_calibration(data, offset)
            header.calibration = calibration
            offset += self.CALIBRATION_SIZE
        
        # Read IMU samples
        imu_samples = []
        for _ in range(header.imu_count):
            sample = self._read_imu_sample(data, offset)
            imu_samples.append(sample)
            offset += self.IMU_SAMPLE_SIZE
        
        # Read GPS samples
        gps_samples = []
        for _ in range(header.gps_count):
            sample = self._read_gps_sample(data, offset)
            gps_samples.append(sample)
            offset += self.GPS_SAMPLE_SIZE
        
        # Read calibration samples (V2 only)
        calibration_samples = []
        if version == 2:
            for _ in range(header.calibration_count):
                sample = self._read_imu_sample(data, offset)
                calibration_samples.append(sample)
                offset += self.IMU_SAMPLE_SIZE
        
        return header, imu_samples, gps_samples, calibration_samples
    
    def read_as_numpy(self) -> Tuple[Header, np.ndarray, np.ndarray, np.ndarray]:
        """Read data as numpy arrays for fast processing"""
        header, imu_list, gps_list, cal_list = self.read()
        
        # Convert to numpy arrays
        imu_dtype = [
            ('t', 'f8'), ('ax', 'f4'), ('ay', 'f4'), ('az', 'f4'),
            ('gx', 'f4'), ('gy', 'f4'), ('gz', 'f4')
        ]
        imu_array = np.array([
            (s.timestamp, s.ax, s.ay, s.az, s.gx, s.gy, s.gz)
            for s in imu_list
        ], dtype=imu_dtype)
        
        gps_dtype = [
            ('t', 'f8'), ('lat', 'f8'), ('lon', 'f8'),
            ('speed', 'f4'), ('heading', 'f4'), ('accuracy', 'f4')
        ]
        gps_array = np.array([
            (s.timestamp, s.lat, s.lon, s.speed, s.heading, s.accuracy)
            for s in gps_list
        ], dtype=gps_dtype)
        
        cal_array = np.array([
            (s.timestamp, s.ax, s.ay, s.az, s.gx, s.gy, s.gz)
            for s in cal_list
        ], dtype=imu_dtype)
        
        return header, imu_array, gps_array, cal_array
    
    def read_as_dataframes(self) -> Tuple[Header, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Read data as pandas DataFrames for easy analysis"""
        header, imu_list, gps_list, cal_list = self.read()
        
        # Convert IMU samples to DataFrame
        imu_df = pd.DataFrame([
            {
                'timestamp': s.timestamp,
                'ax': s.ax,
                'ay': s.ay,
                'az': s.az,
                'gx': s.gx,
                'gy': s.gy,
                'gz': s.gz
            }
            for s in imu_list
        ])
        
        # Convert GPS samples to DataFrame
        gps_df = pd.DataFrame([
            {
                'timestamp': s.timestamp,
                'lat': s.lat,
                'lon': s.lon,
                'speed': s.speed,
                'heading': s.heading,
                'accuracy': s.accuracy
            }
            for s in gps_list
        ])
        
        # Convert calibration samples to DataFrame
        cal_df = pd.DataFrame([
            {
                'timestamp': s.timestamp,
                'ax': s.ax,
                'ay': s.ay,
                'az': s.az,
                'gx': s.gx,
                'gy': s.gy,
                'gz': s.gz
            }
            for s in cal_list
        ])
        
        # Add time columns in seconds relative to start
        if len(imu_df) > 0:
            imu_df['time_s'] = (imu_df['timestamp'] - imu_df['timestamp'].iloc[0]) / 1000
        if len(gps_df) > 0:
            t0 = imu_df['timestamp'].iloc[0] if len(imu_df) > 0 else gps_df['timestamp'].iloc[0]
            gps_df['time_s'] = (gps_df['timestamp'] - t0) / 1000
        if len(cal_df) > 0:
            cal_df['time_s'] = (cal_df['timestamp'] - cal_df['timestamp'].iloc[0]) / 1000
        
        return header, imu_df, gps_df, cal_df
    
    def _read_header(self, data: bytes, offset: int, version: int) -> Header:
        # Magic string (16 bytes)
        magic = data[offset:offset+16].rstrip(b'\x00').decode('ascii')
        offset += 16
        
        # Unpack header fields
        imu_count, gps_count = struct.unpack_from('<II', data, offset)
        offset += 8
        
        # V2 has calibration count
        calibration_count = 0
        has_calibration = False
        if version == 2:
            calibration_count, = struct.unpack_from('<I', data, offset)
            offset += 4
            has_calibration = struct.unpack_from('<B', data, offset)[0] == 1
            offset += 1
        
        session_start, = struct.unpack_from('<d', data, offset)
        offset += 8
        
        phone_orient_byte, demo_mode_byte = struct.unpack_from('<BB', data, offset)
        phone_orientation = 'coxswain' if phone_orient_byte == 1 else 'rower'
        demo_mode = demo_mode_byte == 1
        offset += 2
        
        catch_thresh, finish_thresh = struct.unpack_from('<ff', data, offset)
        
        return Header(
            magic=magic,
            version=version,
            imu_count=imu_count,
            gps_count=gps_count,
            session_start=session_start,
            phone_orientation=phone_orientation,
            demo_mode=demo_mode,
            catch_threshold=catch_thresh,
            finish_threshold=finish_thresh,
            calibration_count=calibration_count,
            has_calibration=has_calibration
        )
    
    def _read_calibration(self, data: bytes, offset: int) -> CalibrationData:
        """Read calibration data block (V2 only)"""
        pitch_offset, = struct.unpack_from('<f', data, offset)
        offset += 4
        roll_offset, = struct.unpack_from('<f', data, offset)
        offset += 4
        yaw_offset, = struct.unpack_from('<f', data, offset)
        offset += 4
        lateral_offset, = struct.unpack_from('<f', data, offset)
        offset += 4
        gravity_magnitude, = struct.unpack_from('<f', data, offset)
        offset += 4
        samples, = struct.unpack_from('<I', data, offset)
        offset += 4
        variance, = struct.unpack_from('<f', data, offset)
        offset += 4
        timestamp, = struct.unpack_from('<d', data, offset)
        
        return CalibrationData(
            pitch_offset=pitch_offset,
            roll_offset=roll_offset,
            yaw_offset=yaw_offset,
            lateral_offset=lateral_offset,
            gravity_magnitude=gravity_magnitude,
            samples=samples,
            variance=variance,
            timestamp=timestamp
        )
    
    def _read_imu_sample(self, data: bytes, offset: int) -> IMUSample:
        t, ax, ay, az, gx, gy, gz = struct.unpack_from('<dffffff', data, offset)
        return IMUSample(t, ax, ay, az, gx, gy, gz)
    
    def _read_gps_sample(self, data: bytes, offset: int) -> GPSSample:
        t, lat, lon, speed, heading, accuracy = struct.unpack_from('<dddfff', data, offset)
        return GPSSample(t, lat, lon, speed, heading, accuracy)


def example_usage():
    """Example: Read and plot data"""
    import matplotlib.pyplot as plt
    
    # Read data
    reader = WRCDataReader('stroke_coach_2025-10-14.wrcdata')
    header, imu, gps, cal = reader.read_as_numpy()
    
    print(f"Session info:")
    print(f"  Format version: V{header.version}")
    print(f"  IMU samples: {len(imu)}")
    print(f"  GPS samples: {len(gps)}")
    print(f"  Phone orientation: {header.phone_orientation}")
    print(f"  Demo mode: {header.demo_mode}")
    
    if header.has_calibration and header.calibration:
        c = header.calibration
        print(f"  Calibration: pitch={c.pitch_offset:.1f}°, roll={c.roll_offset:.1f}°")
        print(f"  Calibration samples: {len(cal)}")
        print(f"  Gravity: {c.gravity_magnitude:.2f} m/s²")
    
    # Plot IMU data
    fig, axes = plt.subplots(3, 1, figsize=(12, 8))
    
    # Convert timestamps to seconds
    t_imu = (imu['t'] - imu['t'][0]) / 1000
    
    # Acceleration
    axes[0].plot(t_imu, imu['ax'], label='ax')
    axes[0].plot(t_imu, imu['ay'], label='ay')
    axes[0].plot(t_imu, imu['az'], label='az')
    axes[0].set_ylabel('Acceleration (m/s²)')
    axes[0].legend()
    axes[0].grid(True)
    
    # Gyroscope
    axes[1].plot(t_imu, imu['gx'], label='gx')
    axes[1].plot(t_imu, imu['gy'], label='gy')
    axes[1].plot(t_imu, imu['gz'], label='gz')
    axes[1].set_ylabel('Angular velocity (deg/s)')
    axes[1].legend()
    axes[1].grid(True)
    
    # GPS speed
    if len(gps) > 0:
        t_gps = (gps['t'] - imu['t'][0]) / 1000
        axes[2].plot(t_gps, gps['speed'], 'o-')
        axes[2].set_ylabel('Speed (m/s)')
        axes[2].set_xlabel('Time (s)')
        axes[2].grid(True)
    
    plt.tight_layout()
    plt.savefig('rowing_data.png', dpi=150)
    print("Plot saved as rowing_data.png")


def example_advanced_processing():
    """Example: Advanced signal processing"""
    from scipy import signal
    
    reader = WRCDataReader('stroke_coach_2025-10-14.wrcdata')
    header, imu, gps, cal = reader.read_as_numpy()
    
    # Extract fore-aft acceleration
    ay = imu['ay']
    
    # Design band-pass filter (0.3-1.2 Hz for rowing)
    fs = 50  # Assuming 50 Hz sample rate
    lowcut = 0.3
    highcut = 1.2
    
    sos = signal.butter(2, [lowcut, highcut], btype='band', fs=fs, output='sos')
    ay_filtered = signal.sosfilt(sos, ay)
    
    # Detect strokes (simple peak detection)
    peaks, _ = signal.find_peaks(ay_filtered, height=0.5, distance=fs)
    
    stroke_rate = len(peaks) / (len(ay) / fs) * 60  # strokes per minute
    
    print(f"Detected {len(peaks)} strokes")
    print(f"Average stroke rate: {stroke_rate:.1f} SPM")
    
    return ay_filtered, peaks


def example_pandas_analysis():
    """Example: Using pandas DataFrames for analysis"""
    reader = WRCDataReader('stroke_coach_2025-10-14.wrcdata')
    header, imu_df, gps_df, cal_df = reader.read_as_dataframes()
    
    print("=== DataFrame Analysis ===")
    print(f"\nIMU Data Shape: {imu_df.shape}")
    print(imu_df.head())
    
    print(f"\nGPS Data Shape: {gps_df.shape}")
    print(gps_df.head())
    
    if not cal_df.empty:
        print(f"\nCalibration Data Shape: {cal_df.shape}")
        print(cal_df.describe())
    
    # Calculate statistics
    print("\n=== Statistics ===")
    print(f"Mean acceleration (ay): {imu_df['ay'].mean():.3f} m/s²")
    print(f"Std acceleration (ay): {imu_df['ay'].std():.3f} m/s²")
    
    if not gps_df.empty:
        print(f"Mean speed: {gps_df['speed'].mean():.2f} m/s")
        print(f"Max speed: {gps_df['speed'].max():.2f} m/s")
    
    # Resample to 1 second intervals
    imu_df.set_index('time_s', inplace=True)
    resampled = imu_df['ay'].resample('1S').mean()
    print(f"\nResampled data points: {len(resampled)}")
    
    return imu_df, gps_df, cal_df


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python read_wrcdata.py <file.wrcdata>")
        print("\nExample usage functions:")
        print("  - example_usage(): Read and plot data")
        print("  - example_advanced_processing(): Signal processing example")
        print("  - example_pandas_analysis(): Pandas DataFrame analysis")
        sys.exit(1)
    
    filepath = sys.argv[1]
    reader = WRCDataReader(filepath)
    header, imu, gps, cal = reader.read()
    
    print(f"✓ Successfully read {filepath}")
    print(f"  Format: V{header.version}")
    print(f"  IMU samples: {len(imu):,}")
    print(f"  GPS samples: {len(gps):,}")
    if len(imu) > 0:
        print(f"  Duration: {(imu[-1].timestamp - imu[0].timestamp) / 1000:.1f} seconds")
    print(f"  Phone: {header.phone_orientation}")
    print(f"  Settings: catch={header.catch_threshold}, finish={header.finish_threshold}")
    
    if header.has_calibration:
        print(f"\n✓ Calibration data present:")
        if header.calibration:
            c = header.calibration
            print(f"  Pitch offset: {c.pitch_offset:.2f}°")
            print(f"  Roll offset: {c.roll_offset:.2f}°")
            print(f"  Gravity: {c.gravity_magnitude:.3f} m/s²")
            print(f"  Quality (variance): {c.variance:.6f}")
            print(f"  Calibration samples: {len(cal):,}")
    else:
        print("\n  No calibration data (V1 format or uncalibrated)")

