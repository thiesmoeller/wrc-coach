#!/usr/bin/env python3
"""
Test script for pandas DataFrame reader
Demonstrates V2 format reading with calibration data
"""

import sys
import pandas as pd
from read_wrcdata import WRCDataReader


def test_pandas_reader(filepath):
    """Test reading .wrcdata file as pandas DataFrames"""
    
    print("=" * 80)
    print("PANDAS DATAFRAME READER TEST")
    print("=" * 80)
    
    # Read data
    reader = WRCDataReader(filepath)
    header, imu_df, gps_df, cal_df = reader.read_as_dataframes()
    
    # Display header info
    print(f"\n📁 File: {filepath}")
    print(f"   Format: V{header.version}")
    print(f"   Phone: {header.phone_orientation}")
    print(f"   Demo mode: {header.demo_mode}")
    
    # IMU DataFrame info
    print(f"\n📊 IMU DataFrame:")
    print(f"   Shape: {imu_df.shape}")
    print(f"   Columns: {list(imu_df.columns)}")
    print(f"   Duration: {imu_df['time_s'].max():.1f} seconds")
    print(f"   Sample rate: ~{len(imu_df) / imu_df['time_s'].max():.1f} Hz")
    print("\n   First 3 samples:")
    print(imu_df.head(3).to_string(index=False))
    
    print(f"\n   Statistics:")
    print(imu_df[['ax', 'ay', 'az']].describe().to_string())
    
    # GPS DataFrame info
    print(f"\n🛰️  GPS DataFrame:")
    print(f"   Shape: {gps_df.shape}")
    if not gps_df.empty:
        print(f"   Columns: {list(gps_df.columns)}")
        print(f"   Sample rate: ~{len(gps_df) / gps_df['time_s'].max():.2f} Hz")
        print("\n   First 3 samples:")
        print(gps_df.head(3).to_string(index=False))
        
        print(f"\n   Statistics:")
        print(gps_df[['speed', 'heading', 'accuracy']].describe().to_string())
    else:
        print("   No GPS data")
    
    # Calibration info
    print(f"\n🎯 Calibration:")
    if header.has_calibration and header.calibration:
        c = header.calibration
        print(f"   Present: Yes")
        print(f"   Pitch offset: {c.pitch_offset:.2f}°")
        print(f"   Roll offset: {c.roll_offset:.2f}°")
        print(f"   Yaw offset: {c.yaw_offset:.2f}°")
        print(f"   Gravity: {c.gravity_magnitude:.3f} m/s²")
        print(f"   Samples: {c.samples}")
        print(f"   Variance: {c.variance:.6f}")
        
        quality = "Good" if c.variance < 0.01 else "Fair" if c.variance < 0.05 else "Poor"
        print(f"   Quality: {quality}")
        
        print(f"\n   Calibration samples DataFrame:")
        print(f"   Shape: {cal_df.shape}")
        if not cal_df.empty:
            print(f"   Duration: {cal_df['time_s'].max():.2f} seconds")
            print("\n   First 3 samples:")
            print(cal_df.head(3).to_string(index=False))
            
            print(f"\n   Statistics:")
            print(cal_df[['ax', 'ay', 'az']].describe().to_string())
    else:
        print(f"   Present: No (V{header.version} format)")
    
    # Analysis examples
    print(f"\n📈 Quick Analysis:")
    
    # Mean acceleration
    mean_ay = imu_df['ay'].mean()
    std_ay = imu_df['ay'].std()
    print(f"   Mean fore-aft accel: {mean_ay:.3f} ± {std_ay:.3f} m/s²")
    
    # Speed stats
    if not gps_df.empty and gps_df['speed'].max() > 0:
        mean_speed = gps_df['speed'].mean()
        max_speed = gps_df['speed'].max()
        print(f"   Mean speed: {mean_speed:.2f} m/s ({mean_speed * 3.6:.1f} km/h)")
        print(f"   Max speed: {max_speed:.2f} m/s ({max_speed * 3.6:.1f} km/h)")
        
        # Calculate split
        if mean_speed > 0.1:
            split_sec = 500 / mean_speed
            split_min = int(split_sec // 60)
            split_s = int(split_sec % 60)
            print(f"   Mean split: {split_min}:{split_s:02d} /500m")
    
    # Stroke detection (simple)
    from scipy import signal
    if len(imu_df) > 100:
        fs = len(imu_df) / imu_df['time_s'].max()
        sos = signal.butter(2, [0.3, 1.2], btype='band', fs=fs, output='sos')
        ay_filtered = signal.sosfilt(sos, imu_df['ay'].values)
        peaks, _ = signal.find_peaks(ay_filtered, height=0.3, distance=int(fs*0.8))
        
        if len(peaks) > 1:
            stroke_rate = 60 / (imu_df['time_s'].max() / len(peaks))
            print(f"   Estimated stroke rate: {stroke_rate:.1f} SPM ({len(peaks)} strokes)")
    
    print("\n" + "=" * 80)
    print("✅ Test completed successfully!")
    print("=" * 80)


def test_export(filepath):
    """Test exporting to various formats"""
    
    print("\n" + "=" * 80)
    print("EXPORT TEST")
    print("=" * 80)
    
    reader = WRCDataReader(filepath)
    header, imu_df, gps_df, cal_df = reader.read_as_dataframes()
    
    # Export to CSV
    csv_file = filepath.replace('.wrcdata', '_imu.csv')
    imu_df.to_csv(csv_file, index=False)
    print(f"\n✅ Exported IMU data to: {csv_file}")
    print(f"   Rows: {len(imu_df)}, Size: {len(imu_df) * imu_df.shape[1] * 8 / 1024:.1f} KB")
    
    if not gps_df.empty:
        gps_csv = filepath.replace('.wrcdata', '_gps.csv')
        gps_df.to_csv(gps_csv, index=False)
        print(f"✅ Exported GPS data to: {gps_csv}")
    
    if not cal_df.empty:
        cal_csv = filepath.replace('.wrcdata', '_calibration.csv')
        cal_df.to_csv(cal_csv, index=False)
        print(f"✅ Exported calibration data to: {cal_csv}")
    
    # Export to Excel (if available)
    try:
        excel_file = filepath.replace('.wrcdata', '_data.xlsx')
        with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
            imu_df.to_excel(writer, sheet_name='IMU', index=False)
            if not gps_df.empty:
                gps_df.to_excel(writer, sheet_name='GPS', index=False)
            if not cal_df.empty:
                cal_df.to_excel(writer, sheet_name='Calibration', index=False)
        print(f"✅ Exported to Excel: {excel_file}")
    except ImportError:
        print("⚠️  openpyxl not installed, skipping Excel export")
        print("   Install with: pip install openpyxl")
    
    print()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python test_pandas_reader.py <file.wrcdata>")
        print("\nThis script tests:")
        print("  - Reading V2 format with calibration data")
        print("  - Pandas DataFrame conversion")
        print("  - Basic data analysis")
        print("  - Export to CSV/Excel")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    try:
        # Run tests
        test_pandas_reader(filepath)
        test_export(filepath)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

