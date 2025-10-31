#!/usr/bin/env python3
"""Quick check of WRC data file format and orientation data"""

import struct
import sys
from pathlib import Path
import math

def check_file(filepath: str):
    """Check file format and orientation data"""
    with open(filepath, 'rb') as f:
        data = f.read()
    
    # Check magic string
    magic = data[0:16].rstrip(b'\x00').decode('ascii')
    print(f"File: {Path(filepath).name}")
    print(f"Magic: {magic}")
    
    if magic.startswith('WRC_COACH_V3'):
        version = 3
        print(f"✓ Format: V{version} (includes orientation/magnetometer)")
    elif magic.startswith('WRC_COACH_V2'):
        version = 2
        print(f"✗ Format: V{version} (no orientation/magnetometer)")
    elif magic.startswith('WRC_COACH_V1'):
        version = 1
        print(f"✗ Format: V{version} (legacy)")
    else:
        print(f"✗ Unknown format: {magic}")
        return
    
    # Read header
    offset = 16
    imu_count, gps_count = struct.unpack_from('<II', data, offset)
    offset += 8
    
    if version >= 2:
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
    
    print(f"\nHeader info:")
    print(f"  IMU samples: {imu_count:,}")
    print(f"  GPS samples: {gps_count:,}")
    print(f"  Phone orientation: {phone_orientation}")
    print(f"  Demo mode: {demo_mode}")
    
    # Check for orientation data in V3 files
    if version == 3:
        # Skip calibration if present
        if version >= 2 and has_calibration:
            offset += 64  # CALIBRATION_SIZE
        
        # Check first few IMU samples for orientation data
        IMU_SAMPLE_SIZE_V3 = 44
        samples_with_orientation = 0
        samples_checked = min(100, imu_count)  # Check first 100 samples
        
        print(f"\nChecking first {samples_checked} IMU samples for orientation data...")
        
        for i in range(samples_checked):
            # V3 format: d (timestamp) + fffffff (ax,ay,az,gx,gy,gz) + fff (mx,my,mz)
            t, ax, ay, az, gx, gy, gz, mx, my, mz = struct.unpack_from('<dfffffffff', data, offset)
            
            # Check if orientation data is present (not NaN)
            if not (math.isnan(mx) and math.isnan(my) and math.isnan(mz)):
                samples_with_orientation += 1
                if samples_with_orientation == 1:
                    print(f"  First sample with orientation: alpha={mx:.1f}°, beta={my:.1f}°, gamma={mz:.1f}°")
            
            offset += IMU_SAMPLE_SIZE_V3
        
        if samples_with_orientation > 0:
            print(f"\n✓ Orientation data found: {samples_with_orientation}/{samples_checked} samples checked")
            print(f"  Estimated: {samples_with_orientation * imu_count // samples_checked:,}/{imu_count:,} total samples")
        else:
            print(f"\n✗ No orientation data found in first {samples_checked} samples")
            print(f"  All mx/my/mz values are NaN")
    else:
        print(f"\n✗ V{version} format does not include orientation data")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python check_file.py <file.wrcdata>")
        sys.exit(1)
    
    check_file(sys.argv[1])

