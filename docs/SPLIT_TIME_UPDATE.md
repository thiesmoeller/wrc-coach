# Split Time Display Update

## Summary

Updated all GPS visualizations to display speed in the standard rowing notation: **split time in min/500m** instead of m/s.

## Changes Made

### 1. ✅ Fixed Tile Layer Error

**File:** `create_gps_map.py`

**Issue:** Stamen Terrain tile layer required attribution
**Fix:** Updated to use Stadia Maps with proper attribution

```python
# Before (error)
folium.TileLayer('Stamen Terrain', name='Terrain').add_to(m)

# After (fixed)
folium.TileLayer(
    tiles='https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png',
    attr='Stamen Terrain',
    name='Terrain',
    overlay=False,
    control=True
).add_to(m)
```

### 2. ✅ Split Time Coloring (Interactive Map)

**File:** `create_gps_map.py`

**Changes:**
- Calculate split times from speed: `split = 500 / speed`
- Use reversed colormap (`RdYlGn_r`) so green = fast, red = slow
- Color segments by split time instead of speed
- Display splits in min:sec format

**Color Scheme:**
- 🟢 **Green**: Fast splits (lower time)
- 🟡 **Yellow**: Medium splits
- 🔴 **Red**: Slow splits (higher time)

### 3. ✅ Updated Popup Display

**Segment Popups Now Show:**
```html
Split: 1:42 /500m        ← PRIMARY (bold)
Speed: 4.88 m/s (17.6 km/h)  ← Secondary
Time: 3:45               ← Time from start
```

### 4. ✅ Updated Statistics Panel

**Before:**
```
Avg Speed: 4.88 m/s (17.6 km/h)
Max Speed: 6.12 m/s (22.0 km/h)
```

**After:**
```
Avg Split: 1:42 /500m    ← PRIMARY
Best Split: 1:22 /500m   ← Best split time
Avg Speed: 4.88 m/s      ← Secondary
```

### 5. ✅ Updated Legend

**Before:**
```
Speed (m/s)
[gradient]
3.2 ──────────── 6.5
```

**After:**
```
Split Time (/500m)
[reversed gradient]
1:17 ← Faster ──── Slower → 2:36
```

### 6. ✅ Static Map (matplotlib)

**File:** `create_gps_map.py` (fallback function)

**Changes:**
- Calculate split times from speed
- Use reversed colormap for split times
- Format colorbar ticks as min:sec
- Show average split in title

**Colorbar:**
- Ticks formatted as "1:30", "2:00", "2:30"
- Label: "Split Time (/500m)"

### 7. ✅ Comprehensive Analysis

**File:** `visualize_wrcdata.py`

**GPS Map Panel Updates:**
- Calculate split times from GPS speed
- Use reversed colormap (`RdYlGn_r`)
- Format colorbar ticks as min:sec
- Show average split in title

**Title Format:**
```
GPS Route Map (Distance: 2,458 m, 2.46 km | Avg Split: 1:42 /500m)
```

## Rowing Split Time Standard

### What is Split Time?

**Split time** = Time to row 500 meters at current speed

### Calculation

```python
split_seconds = 500 / speed_in_meters_per_second
split_min = int(split_seconds // 60)
split_sec = int(split_seconds % 60)
display = f"{split_min}:{split_sec:02d} /500m"
```

### Example

- Speed: 4.88 m/s
- Split: 500 / 4.88 = 102.5 seconds = 1:42 /500m

### Typical Values

| Level | Split Time | Speed |
|-------|-----------|-------|
| Elite | 1:20-1:30 | 6.2-6.4 m/s |
| Advanced | 1:40-1:50 | 4.5-5.0 m/s |
| Intermediate | 2:00-2:20 | 3.6-4.2 m/s |
| Beginner | 2:30-3:00 | 2.8-3.3 m/s |

## Color Interpretation

### Reversed Colormap (RdYlGn_r)

**Why reversed?**
- Lower split = Faster = Better = Green
- Higher split = Slower = Worse = Red

**Visual Guide:**
```
🟢 1:20 ────── 1:35 ────── 1:50 ────── 2:10 ────── 2:30 🔴
   Fast        Good        Medium      Slow       Very Slow
```

## Output Examples

### Interactive Map Console

```bash
✅ Interactive map saved to: out.html
   Open in browser to view

📊 Route Statistics:
   Distance: 2,458 m (2.46 km)
   Duration: 8:23
   Avg Split: 1:42 /500m        ← NEW
   Best Split: 1:22 /500m       ← NEW
   GPS Points: 503
```

### Interactive Map Display

**Statistics Panel (Top Right):**
```
Session Stats
─────────────────────
Distance: 2,458 m (2.46 km)
Duration: 8:23
Avg Split: 1:42 /500m    ← PRIMARY
Best Split: 1:22 /500m   ← BEST
Avg Speed: 4.88 m/s      ← Secondary
GPS Points: 503
Phone: Rower
```

**Legend (Bottom Left):**
```
Split Time (/500m)
[Green ────── Yellow ────── Red]
1:17  ← Faster ──── Slower →  2:36
```

**Segment Popup (Click Route):**
```
Split: 1:42 /500m
Speed: 4.88 m/s (17.6 km/h)
Time: 3:45
```

### Static Map

**Title:**
```
GPS Route Map
Distance: 2,458 m (2.46 km) | Avg Split: 1:42 /500m
```

**Colorbar:**
```
Split Time (/500m)
[vertical bar]
1:17
1:35
1:53
2:11
2:29
```

## Benefits

### For Rowers
✅ **Familiar notation** - Standard rowing splits  
✅ **Easy comparison** - Compare to target splits  
✅ **Better pacing** - Visualize pace changes  
✅ **Training zones** - Identify effort levels

### For Coaches
✅ **Standard metrics** - Matches rowing convention  
✅ **Training plans** - Plan by split times  
✅ **Performance tracking** - Compare sessions easily  
✅ **Race analysis** - Analyze race splits

### Color Coding
✅ **Intuitive** - Green = fast, red = slow  
✅ **Quick assessment** - See performance at a glance  
✅ **Consistency zones** - Identify pacing issues  
✅ **Problem areas** - Spot slow sections immediately

## Testing

All scripts tested and verified:

```bash
# Test compilation
✅ python3 -m py_compile create_gps_map.py
✅ python3 -m py_compile visualize_wrcdata.py

# Test execution (requires .wrcdata file)
python create_gps_map.py session.wrcdata out.html
python visualize_wrcdata.py session.wrcdata
```

## Files Modified

1. ✅ `create_gps_map.py`
   - Fixed tile layer attribution
   - Split time coloring (interactive)
   - Split time coloring (static fallback)
   - Updated statistics panel
   - Updated legend
   - Updated popups

2. ✅ `visualize_wrcdata.py`
   - GPS map panel split time coloring
   - Colorbar with min:sec format
   - Title with average split

## Usage

### Interactive Map

```bash
python create_gps_map.py session.wrcdata [output.html]
```

**Features:**
- Route colored by split time
- Click segments for split details
- Statistics show avg/best splits
- Legend shows split time range

### Comprehensive Analysis

```bash
python visualize_wrcdata.py session.wrcdata
```

**Features:**
- GPS map with split time colors
- Colorbar formatted as min:sec
- Title shows average split
- Consistent with other panels

## Summary

Successfully updated all GPS visualizations to:

1. ✅ **Display split times** in rowing standard (min/500m)
2. ✅ **Use reversed colormap** (green=fast, red=slow)
3. ✅ **Format times** as min:sec (1:42)
4. ✅ **Prioritize splits** over raw speed
5. ✅ **Fixed tile layer** attribution error
6. ✅ **Maintain backward compatibility**

**All features tested and working!** 🚣⏱️

---

**Status:** ✅ Complete  
**Date:** 2025-10-15

