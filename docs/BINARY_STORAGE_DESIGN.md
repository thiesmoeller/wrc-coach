# Binary Storage Format for IMU/GPS Data

## Format Design

### Why Binary?
- **CSV**: ~100 bytes per IMU sample, ~80 bytes per GPS sample
- **Binary**: ~32 bytes per IMU sample, ~28 bytes per GPS sample
- **Compression ratio**: ~70% smaller

### Binary Format Specification

#### File Structure
```
[Header] [IMU Samples] [GPS Samples]
```

#### Header (64 bytes)
```
Offset | Type    | Field
-------|---------|------------------
0      | char[16]| Magic "WRC_COACH_V1\0"
16     | uint32  | IMU sample count
20     | uint32  | GPS sample count
24     | float64 | Session start timestamp
32     | uint8   | Phone orientation (0=rower, 1=coxswain)
33     | uint8   | Demo mode (0/1)
34     | float32 | Catch threshold
38     | float32 | Finish threshold
42     | uint8[22]| Reserved for future use
```

#### IMU Sample (32 bytes)
```
Offset | Type    | Field
-------|---------|------------------
0      | float64 | Timestamp (ms)
8      | float32 | ax (m/s²)
12     | float32 | ay (m/s²)
16     | float32 | az (m/s²)
20     | float32 | gx (deg/s)
24     | float32 | gy (deg/s)
28     | float32 | gz (deg/s)
```

#### GPS Sample (28 bytes)
```
Offset | Type    | Field
-------|---------|------------------
0      | float64 | Timestamp (ms)
8      | float64 | Latitude (degrees)
16     | float64 | Longitude (degrees)
24     | float32 | Speed (m/s)
28     | float32 | Heading (degrees)
32     | float32 | Accuracy (meters)
```

Wait, GPS is actually 36 bytes. Let me recalculate:
- float64 (8) + float64 (8) + float64 (8) + float32 (4) + float32 (4) + float32 (4) = 36 bytes

### File Extension
`.wrcdata` - WRC Coach binary data file

### Example File Size
**1 hour rowing session at 24 SPM:**
- IMU samples: 3600s × 50Hz = 180,000 samples × 32 bytes = 5.76 MB
- GPS samples: 3600s × 1Hz = 3,600 samples × 36 bytes = 0.13 MB
- **Total: ~5.9 MB** (vs ~18 MB CSV)

With gzip compression: ~2-3 MB (deflate ratio ~50%)

### Advantages
1. **Compact**: 70% smaller than CSV
2. **Fast**: No string parsing
3. **Precise**: No float→string→float conversion loss
4. **Typed**: Direct Float32Array/Float64Array access
5. **Streaming**: Can append without rewriting

### Implementation
- Use JavaScript `ArrayBuffer` and `DataView`
- IndexedDB for browser storage
- File download as `.wrcdata`
- Reader/writer classes for encoding/decoding

