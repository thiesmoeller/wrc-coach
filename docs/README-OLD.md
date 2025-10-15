# 🚣 WRC Coach - Wilhelmsburger Ruder Club

A modern Progressive Web App (PWA) for real-time rowing performance feedback at WRC (est. 1895). Monitor your crew's stroke cycle, timing, and boat stability using only your smartphone's built-in sensors.

## Features

### 📊 Real-Time Visualizations

1. **Polar Stroke Cycle Plot**
   - 360° visualization of the complete stroke cycle
   - Drive phase (0-144°) in blue
   - Recovery phase (144-360°) in purple
   - Baseline-corrected acceleration to remove environmental drag

2. **Boat Stability Monitor**
   - Horizontal timeline showing roll (port/starboard lean)
   - Real-time feedback on catch synchronization
   - Visual detection of uneven oar work

### 📈 Performance Metrics

- **Stroke Rate** (SPM - strokes per minute)
- **Drive Percentage** (ratio of drive time to total stroke time)
  - **Optimal**: 30-35% (1:2 ratio - steady state)
  - **Good**: 35-40% (racing pace)
  - **Poor**: >45% (rushed recovery) or <25% (slow drive)
- **Split Time** (/500m - standard rowing pace metric)
- **Sample Count** (data quality indicator)

### 🎯 Key Capabilities

- ✅ No external sensors required - uses phone's IMU + GPS
- ✅ Works offline after first load
- ✅ Installable as standalone app
- ✅ 2+ hour recording sessions
- ✅ Dual export format: CSV + Binary (.wrcdata)
- ✅ Compact binary format (70% smaller than CSV)
- ✅ Sensor calibration for off-center mounting
- ✅ Automatic baseline correction for wind/water drag
- ✅ Wake lock to prevent screen dimming
- ✅ State-of-the-art signal processing (Kalman, Complementary filters)

## Quick Start

### Prerequisites

- Modern smartphone (iOS 13+ or Android 5+)
- Web browser with motion sensor access (Safari on iOS, Chrome on Android)
- HTTPS connection (required for sensor access)

### Installation

1. **Host the files** on any web server with HTTPS:
   ```bash
   # Option 1: Simple Python server (for testing only, not HTTPS)
   python -m http.server 8000
   
   # Option 2: Using ngrok for HTTPS tunnel
   ngrok http 8000
   
   # Option 3: Deploy to GitHub Pages, Netlify, or Vercel (recommended)
   ```

2. **Access on your phone**:
   - Open the HTTPS URL in your mobile browser
   - Tap the "Share" button (iOS) or menu (Android)
   - Select "Add to Home Screen"

3. **Grant permissions**:
   - Motion & Orientation access (required)
   - Location access (for GPS speed)

### Usage

#### Step 1: Calibration (Optional but Recommended)

1. Mount your phone on the boat (near centerline for best results)
2. Tap **Calibrate** button
3. Adjust offset sliders if mounted off-center:
   - **Offset from centerline**: Left (-) or Right (+) in cm
   - **Fore/Aft offset**: Stern (-) or Bow (+) in cm
4. Tap **Calibrate Now** and hold steady for 2 seconds

#### Step 2: Start Recording

1. Tap **Start Session**
2. Grant motion and location permissions when prompted
3. Begin rowing - metrics and charts update in real-time

#### Step 3: Monitor Performance

- **Top chart**: Polar plot shows stroke cycle shape
  - Consistent shape = good technique
  - Smooth curves = efficient power application
  
- **Bottom chart**: Stability shows boat balance
  - Line near center = good balance
  - Oscillations = timing or balance issues

#### Step 4: Stop and Export

1. Tap **Stop** when finished
2. Tap **Export CSV** to download data in **both formats**:
   - `.csv` - Human-readable text format
   - `.wrcdata` - Compact binary format (70% smaller)
3. Analyze in spreadsheet, Python, or custom tools

### Data Export & Reprocessing

The app exports data in **two formats**:

**CSV Format** (`stroke_coach_YYYY-MM-DD.csv`)
- Human-readable text
- Easy to open in Excel/Google Sheets
- ~18 MB for 1-hour session

**Binary Format** (`stroke_coach_YYYY-MM-DD.wrcdata`)
- Compact binary storage
- 70% smaller than CSV (~6 MB for 1-hour session)
- Fast parsing for algorithm development
- Includes session metadata (phone orientation, thresholds, etc.)

**Python Tools Included:**
```bash
# Read binary data
python read_wrcdata.py stroke_coach_2025-10-14.wrcdata

# Create comprehensive analysis plot
python visualize_wrcdata.py stroke_coach_2025-10-14.wrcdata

# Test format integrity
python test_binary_format.py
```

See `BINARY_DATA_README.md` for complete format specification and examples.

## Technical Details

### Sensor Data

**IMU (Inertial Measurement Unit)**
- Sample rate: ~50-100 Hz (device-dependent)
- Accelerometer: Linear acceleration (m/s²)
- Gyroscope: Angular velocity (deg/s)

**GPS**
- Update rate: ~1 Hz
- Provides: speed, heading, accuracy

### Data Processing

1. **High-pass filtering** (0.2-0.3 Hz) removes gravity drift
2. **Stroke segmentation** via acceleration thresholds:
   - Catch: surge acceleration > 0.6 m/s²
   - Finish: surge acceleration < -0.3 m/s²
3. **Baseline correction**: Recovery-phase acceleration averaged and subtracted
4. **Roll calculation**: From gravity vector (atan2 of lateral acceleration)

### Lever-Arm Correction

For off-center mounting, the app corrects for rotational effects:

```
a_CG = a_phone - α × r - ω × (ω × r)
```

Where:
- `a_CG`: Acceleration at boat center of gravity
- `a_phone`: Measured acceleration
- `α`: Angular acceleration
- `ω`: Angular velocity
- `r`: Offset vector from centerline

### Stroke Angle Mapping (Dynamic)

The polar plot angle distribution is **dynamically calculated** based on the measured drive-to-recovery ratio:

- **0°**: Catch (blade enters water)
- **0° to X°**: Drive phase (power application) - where X = 360° × drive%
- **X°**: Finish (blade exits water)
- **X° to 360°**: Recovery phase (return to catch)

**Example**: At 35% drive (optimal 1:2 ratio):
- Drive: 0° → 126°
- Recovery: 126° → 360°

### Drive-to-Recovery Ratio Theory

The **drive%** is one of the most important technique metrics in rowing:

| Ratio | Drive % | Stroke Rate | Scenario |
|-------|---------|-------------|----------|
| 1:3 | 25% | 16-18 SPM | Light steady state |
| 1:2 | 33% | 18-24 SPM | **Optimal technique** |
| 1:1.8 | 36% | 26-32 SPM | Racing pace |
| 1:1.5 | 40% | 32-36 SPM | Sprint finish |
| 1:1 | 50% | Any | **Poor technique** (rushed recovery) |

**Why 1:2 is optimal**:
- Gives the boat maximum time to run on momentum during recovery
- Prevents "check" (backward motion from rushed recovery)
- Allows controlled, smooth repositioning
- Reduces energy waste and improves boat speed

**Common faults**:
- **>40% drive**: Rushing the slide, creating check
- **<30% drive**: Slow hands away, missing the boat's momentum

## File Structure

```
stroke_coach/
├── index.html          # Main app structure
├── styles.css          # Modern, responsive styling
├── app.js              # Core application logic
├── manifest.json       # PWA configuration
├── sw.js               # Service worker (offline support)
├── README.md           # This file
└── icons/              # App icons (create these)
    ├── icon-192.png
    └── icon-512.png
```

## Creating Icons

Generate app icons (192×192 and 512×512) with a rowing theme:

1. Use a design tool (Figma, Canva, etc.)
2. Save as PNG with transparency
3. Place in the root directory
4. Update `manifest.json` if needed

**Quick placeholder icons:**
```bash
# Generate solid color icons with ImageMagick
convert -size 192x192 xc:#1e40af icon-192.png
convert -size 512x512 xc:#1e40af icon-512.png
```

## Deployment Options

### Option 1: GitHub Pages (Free, Easy)

1. Push files to GitHub repository
2. Enable GitHub Pages in Settings
3. Access via `https://username.github.io/repo-name/`

### Option 2: Netlify (Free, Automatic HTTPS)

1. Connect GitHub repository
2. Deploy with one click
3. Custom domain supported

### Option 3: Vercel (Free, Fast CDN)

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in project directory
3. Follow prompts

## Troubleshooting

### Sensors Not Working

- **iOS**: Must use Safari and grant motion permissions
- **Android**: Chrome, Firefox, or Samsung Internet work well
- Ensure HTTPS (required for sensor access)

### GPS Not Updating

- Enable location services in phone settings
- Grant location permission to browser
- Move outdoors for better GPS signal

### Charts Not Updating

- Check that session is started (green status dot)
- Refresh page and try again
- Clear browser cache if PWA is cached incorrectly

### Phone Mounting

- Use waterproof case or bag
- Mount securely to avoid vibration noise
- Keep screen visible for real-time feedback
- Consider external battery for long sessions

## Future Enhancements

Potential additions based on the ChatGPT discussion:

- [ ] Multi-sensor support (handle and seat IMUs)
- [ ] BLE connectivity for external sensors (XIAO BLE Sense)
- [ ] Advanced stroke detection algorithms
- [ ] Crew synchronization metrics (catch spread, finish spread)
- [ ] Historical session comparison
- [ ] Cloud sync and coach dashboard
- [ ] Audio feedback cues
- [ ] Video overlay for technique analysis

## Technical Stack

- **Frontend**: Vanilla JavaScript (no frameworks)
- **Visualization**: HTML5 Canvas API
- **Sensors**: Web APIs (DeviceMotion, Geolocation)
- **Storage**: IndexedDB (future enhancement)
- **PWA**: Service Workers, Web App Manifest

## Browser Compatibility

| Browser | iOS | Android | Notes |
|---------|-----|---------|-------|
| Safari | ✅ | N/A | Requires permission prompt |
| Chrome | ⚠️ | ✅ | iOS version uses WebKit (limited) |
| Firefox | ❌ | ✅ | iOS version not recommended |
| Edge | N/A | ✅ | Chromium-based |

## License

MIT License - Feel free to modify and use for your rowing club!

## Acknowledgments

Inspired by discussions with ChatGPT about creating novel feedback devices for rowing crews. Based on biomechanical principles and modern web technologies.

## Contributing

Contributions welcome! Areas of interest:

- Improved stroke detection algorithms
- Better baseline correction methods
- Multi-boat comparison features
- Coach dashboard and analytics
- Waterproof mounting solutions

---

**Happy Rowing! 🚣‍♀️🚣‍♂️**

For questions or issues, please open a GitHub issue or contact the maintainer.

