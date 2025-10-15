#!/usr/bin/env python3
"""
Test script for WRC Coach binary format
Verifies read/write round-trip and data integrity
"""

import numpy as np
from read_wrcdata import WRCDataReader, IMUSample, GPSSample, Header
import struct
import tempfile
import os


def create_test_data():
    """Generate synthetic test data"""
    print("Generating test data...")
    
    # 10 seconds @ 50 Hz IMU
    n_imu = 500
    t_imu = np.linspace(0, 10000, n_imu)  # ms
    
    # Simulate rowing motion (25 SPM = 2.4s per stroke)
    freq = 25 / 60  # Hz
    
    imu_samples = []
    for i, t in enumerate(t_imu):
        phase = 2 * np.pi * freq * t / 1000
        
        # Simulate stroke pattern
        ay = np.sin(phase) * 2.0 + np.random.normal(0, 0.1)
        ax = np.sin(phase + np.pi/4) * 0.5 + np.random.normal(0, 0.05)
        az = 9.8 + np.random.normal(0, 0.1)
        
        gx = np.sin(phase) * 10 + np.random.normal(0, 1)
        gy = np.cos(phase) * 5 + np.random.normal(0, 1)
        gz = np.random.normal(0, 2)
        
        sample = IMUSample(
            timestamp=t,
            ax=ax, ay=ay, az=az,
            gx=gx, gy=gy, gz=gz
        )
        imu_samples.append(sample)
    
    # 10 GPS samples @ 1 Hz
    n_gps = 10
    t_gps = np.linspace(0, 10000, n_gps)
    
    gps_samples = []
    for i, t in enumerate(t_gps):
        sample = GPSSample(
            timestamp=t,
            lat=53.5 + i * 0.0001,  # Hamburg area
            lon=10.0 + i * 0.0001,
            speed=4.0 + np.random.normal(0, 0.2),
            heading=90.0,
            accuracy=5.0
        )
        gps_samples.append(sample)
    
    print(f"  Created {len(imu_samples)} IMU samples")
    print(f"  Created {len(gps_samples)} GPS samples")
    
    return imu_samples, gps_samples


def write_binary_test_file(imu_samples, gps_samples, filepath):
    """Write test data using the binary format"""
    print(f"\nWriting binary file: {filepath}")
    
    MAGIC = b'WRC_COACH_V1\0\0\0\0'
    HEADER_SIZE = 64
    IMU_SAMPLE_SIZE = 32
    GPS_SAMPLE_SIZE = 36
    
    total_size = HEADER_SIZE + len(imu_samples) * IMU_SAMPLE_SIZE + len(gps_samples) * GPS_SAMPLE_SIZE
    print(f"  Total size: {total_size} bytes ({total_size/1024:.2f} KB)")
    
    with open(filepath, 'wb') as f:
        # Write header
        f.write(MAGIC)
        f.write(struct.pack('<I', len(imu_samples)))  # IMU count
        f.write(struct.pack('<I', len(gps_samples)))   # GPS count
        f.write(struct.pack('<d', 1697200000000.0))    # Session start
        f.write(struct.pack('<B', 0))                  # Phone orientation (rower)
        f.write(struct.pack('<B', 1))                  # Demo mode
        f.write(struct.pack('<f', 0.6))                # Catch threshold
        f.write(struct.pack('<f', -0.3))               # Finish threshold
        f.write(b'\x00' * 22)                          # Reserved
        
        # Write IMU samples
        for sample in imu_samples:
            f.write(struct.pack('<d', sample.timestamp))
            f.write(struct.pack('<f', sample.ax))
            f.write(struct.pack('<f', sample.ay))
            f.write(struct.pack('<f', sample.az))
            f.write(struct.pack('<f', sample.gx))
            f.write(struct.pack('<f', sample.gy))
            f.write(struct.pack('<f', sample.gz))
        
        # Write GPS samples
        for sample in gps_samples:
            f.write(struct.pack('<d', sample.timestamp))
            f.write(struct.pack('<d', sample.lat))
            f.write(struct.pack('<d', sample.lon))
            f.write(struct.pack('<f', sample.speed))
            f.write(struct.pack('<f', sample.heading))
            f.write(struct.pack('<f', sample.accuracy))
    
    print(f"  ✓ File written successfully")


def verify_round_trip(original_imu, original_gps, filepath):
    """Verify data can be read back correctly"""
    print(f"\nVerifying round-trip...")
    
    reader = WRCDataReader(filepath)
    header, read_imu, read_gps = reader.read()
    
    # Verify counts
    assert len(read_imu) == len(original_imu), f"IMU count mismatch: {len(read_imu)} != {len(original_imu)}"
    assert len(read_gps) == len(original_gps), f"GPS count mismatch: {len(read_gps)} != {len(original_gps)}"
    print(f"  ✓ Sample counts match")
    
    # Verify header
    assert header.phone_orientation == 'rower'
    assert header.demo_mode == True
    assert abs(header.catch_threshold - 0.6) < 0.01
    assert abs(header.finish_threshold - (-0.3)) < 0.01
    print(f"  ✓ Header metadata correct")
    
    # Verify IMU data (check first and last samples)
    assert abs(read_imu[0].timestamp - original_imu[0].timestamp) < 0.001
    assert abs(read_imu[0].ax - original_imu[0].ax) < 0.0001
    assert abs(read_imu[-1].ay - original_imu[-1].ay) < 0.0001
    print(f"  ✓ IMU data integrity verified")
    
    # Verify GPS data
    assert abs(read_gps[0].lat - original_gps[0].lat) < 0.000001
    assert abs(read_gps[-1].speed - original_gps[-1].speed) < 0.001
    print(f"  ✓ GPS data integrity verified")
    
    print(f"\n  ✅ All tests passed!")
    return True


def test_numpy_reader(filepath):
    """Test numpy array reading"""
    print(f"\nTesting numpy reader...")
    
    reader = WRCDataReader(filepath)
    header, imu_array, gps_array = reader.read_as_numpy()
    
    print(f"  IMU array shape: {imu_array.shape}")
    print(f"  IMU dtype: {imu_array.dtype}")
    print(f"  GPS array shape: {gps_array.shape}")
    print(f"  GPS dtype: {gps_array.dtype}")
    
    # Verify array access
    assert imu_array['t'].shape[0] == 500
    assert imu_array['ax'].dtype == np.float32
    assert gps_array['lat'].dtype == np.float64
    
    # Test slicing
    first_second = imu_array[imu_array['t'] < 1000]
    print(f"  First second: {len(first_second)} samples")
    
    # Test computation
    mean_ay = np.mean(imu_array['ay'])
    std_ay = np.std(imu_array['ay'])
    print(f"  Mean ay: {mean_ay:.3f} m/s²")
    print(f"  Std ay: {std_ay:.3f} m/s²")
    
    print(f"  ✓ Numpy operations working")


def compare_file_sizes(filepath):
    """Compare binary vs CSV file sizes"""
    print(f"\nFile size comparison...")
    
    # Binary size
    binary_size = os.path.getsize(filepath)
    print(f"  Binary (.wrcdata): {binary_size} bytes ({binary_size/1024:.2f} KB)")
    
    # Generate equivalent CSV
    csv_filepath = filepath.replace('.wrcdata', '.csv')
    reader = WRCDataReader(filepath)
    header, imu, gps = reader.read()
    
    with open(csv_filepath, 'w') as f:
        f.write('t,type,ax,ay,az,gx,gy,gz,lat,lon,speed,heading,accuracy\n')
        for sample in imu:
            f.write(f'{sample.timestamp},imu,{sample.ax},{sample.ay},{sample.az},'
                   f'{sample.gx},{sample.gy},{sample.gz},,,,,,\n')
        for sample in gps:
            f.write(f'{sample.timestamp},gps,,,,,,,'
                   f'{sample.lat},{sample.lon},{sample.speed},{sample.heading},{sample.accuracy}\n')
    
    csv_size = os.path.getsize(csv_filepath)
    print(f"  CSV (.csv): {csv_size} bytes ({csv_size/1024:.2f} KB)")
    
    compression = (1 - binary_size / csv_size) * 100
    print(f"  Compression: {compression:.1f}% smaller")
    print(f"  Ratio: {csv_size/binary_size:.2f}× larger (CSV)")
    
    # Clean up CSV
    os.remove(csv_filepath)


def main():
    print("=" * 70)
    print("WRC Coach Binary Format Test Suite")
    print("=" * 70)
    
    # Create test data
    imu_samples, gps_samples = create_test_data()
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(suffix='.wrcdata', delete=False) as tmp:
        filepath = tmp.name
    
    try:
        # Write binary file
        write_binary_test_file(imu_samples, gps_samples, filepath)
        
        # Verify round-trip
        verify_round_trip(imu_samples, gps_samples, filepath)
        
        # Test numpy reader
        test_numpy_reader(filepath)
        
        # Compare sizes
        compare_file_sizes(filepath)
        
        print("\n" + "=" * 70)
        print("✅ ALL TESTS PASSED")
        print("=" * 70)
        print(f"\nTest file created: {filepath}")
        print("You can use this file with:")
        print(f"  python read_wrcdata.py {filepath}")
        print(f"  python visualize_wrcdata.py {filepath}")
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
    
    # Optionally keep the test file
    keep = input("\nKeep test file? (y/n): ").lower().strip()
    if keep != 'y':
        os.remove(filepath)
        print("Test file deleted.")


if __name__ == '__main__':
    main()

