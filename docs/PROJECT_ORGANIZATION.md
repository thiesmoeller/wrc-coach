# Project Organization

Complete overview of the WRC Coach project structure after reorganization.

## Directory Structure

```
wrc-coach/
├── src/                          # PWA source code
│   ├── components/              # React components
│   │   ├── CalibrationPanel.*   # Phone calibration
│   │   ├── ControlPanel.*       # Main control buttons
│   │   ├── Header.*             # App header with status
│   │   ├── MetricsBar.*         # Performance metrics
│   │   ├── PolarPlot.*          # Stroke cycle visualization
│   │   ├── SessionPanel.*       # Session management UI
│   │   ├── SettingsPanel.*      # App settings
│   │   └── StabilityPlot.*      # Roll stability plot
│   ├── hooks/                   # Custom React hooks
│   │   ├── useCalibration.ts    # Calibration state
│   │   ├── useDeviceMotion.ts   # IMU sensor access
│   │   ├── useGeolocation.ts    # GPS access
│   │   ├── useSessionStorage.ts # Session management
│   │   ├── useSettings.ts       # App settings
│   │   └── useWakeLock.ts       # Keep screen on
│   ├── lib/                     # Core libraries
│   │   ├── calibration/         # Phone calibration
│   │   ├── data-storage/        # Binary format I/O
│   │   ├── filters/             # Signal processing
│   │   │   ├── __tests__/       # Filter unit tests
│   │   │   ├── BandPassFilter.ts
│   │   │   ├── ComplementaryFilter.ts
│   │   │   ├── KalmanFilterGPS.ts
│   │   │   └── LowPassFilter.ts
│   │   ├── stroke-detection/    # Stroke detection
│   │   │   ├── __tests__/       # Detection tests
│   │   │   ├── BaselineCorrector.ts
│   │   │   └── StrokeDetector.ts
│   │   └── transforms/          # Coordinate transforms
│   ├── test/                    # Test setup
│   ├── utils/                   # Utility functions
│   ├── App.tsx                  # Main app component
│   ├── App.css                  # App styles
│   └── main.tsx                 # Entry point
│
├── docs/                        # Documentation
│   ├── README.md                # Documentation index
│   ├── DEPLOYMENT.md            # Deployment guide
│   ├── PROJECT_ORGANIZATION.md  # This file
│   │
│   ├── User Guides/
│   │   ├── READY_FOR_BOAT_CHECKLIST.md
│   │   ├── SESSION_USER_GUIDE.md
│   │   ├── STORAGE_AND_SHARING.md
│   │   ├── DEMO_MODE_FIX.md
│   │   └── PHONE_CALIBRATION_GUIDE.md
│   │
│   ├── Technical/
│   │   ├── BINARY_DATA_README.md
│   │   ├── LIBRARY_USAGE.md
│   │   ├── FILTERING_IMPROVEMENTS.md
│   │   └── RESEARCH_BASED_PATTERN.md
│   │
│   └── History/
│       ├── COMPLETE_UPDATE_SUMMARY.md
│       ├── SESSION_MANAGEMENT_SUMMARY.md
│       └── [other update summaries]
│
├── py_scripts/                  # Python analysis tools
│   ├── README.md                # Python scripts guide
│   ├── create_gps_map.py       # GPS map generation
│   ├── visualize_wrcdata.py    # Data visualization
│   ├── read_wrcdata.py         # Binary data reader
│   ├── test_binary_format.py   # Format validation
│   └── test_pandas_reader.py   # Pandas integration
│
├── ts_tests/                    # TypeScript tests
│   ├── README.md                # Test guide
│   └── test_stroke_simulation.ts # Stroke simulator
│
├── public/                      # Static assets
│   ├── wrc-logo.jpg            # WRC logo
│   ├── favicon.svg             # Favicon
│   └── icon.svg                # App icon
│
├── dist/                        # Built PWA (generated)
│   ├── assets/                 # JS/CSS bundles
│   ├── sw.js                   # Service worker
│   ├── manifest.webmanifest    # PWA manifest
│   └── index.html              # Entry HTML
│
├── Configuration Files
├── .gitignore                  # Git ignore rules
├── .dockerignore               # Docker ignore rules
├── Dockerfile                  # Multi-stage build
├── captain-definition          # CapRover config
├── nginx.conf                  # Nginx PWA config
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── vite.config.ts              # Build config
├── vitest.config.ts            # Test config
└── README.md                   # Main README

```

## File Organization Principles

### Source Code (`src/`)
- **React components** with co-located styles (`.tsx` + `.css`)
- **Hooks** for reusable stateful logic
- **Lib** for framework-agnostic business logic
- **Test files** co-located with implementation (`__tests__/`)

### Documentation (`docs/`)
- **Organized by purpose** (user guides, technical, history)
- **Markdown format** for easy reading
- **Cross-referenced** with relative links
- **Index file** (`docs/README.md`) for navigation

### Analysis Tools (`py_scripts/`)
- **Python scripts** for offline data analysis
- **Not deployed** with PWA
- **Documented** with README
- **Self-contained** with minimal dependencies

### Tests (`ts_tests/`)
- **Integration tests** and simulators
- **Separate from unit tests** (which live in `src/lib/*/__tests__/`)
- **Development only** (not in build)
- **Documented** usage and purpose

## Build Process

### Development
```bash
npm run dev
# → Vite dev server on localhost:3000
# → Hot module replacement
# → Source maps enabled
```

### Production Build
```bash
npm run build
# → TypeScript compilation
# → Vite build to dist/
# → Service worker generation
# → PWA manifest creation
# → Asset optimization (gzip, minify)
```

### Preview
```bash
npm run preview
# → Preview built PWA
# → Test production build locally
```

### Docker Build
```bash
docker build -t wrc-coach .
# → Multi-stage build
# → Stage 1: Build PWA with Node
# → Stage 2: Serve with Nginx
```

## Deployment Artifacts

### Docker Image Contains:
- ✅ Built PWA (`dist/` contents)
- ✅ Nginx configuration
- ✅ Service worker
- ✅ PWA manifest
- ✅ Static assets

### Docker Image Excludes:
- ❌ Source code (`src/`)
- ❌ Documentation (`docs/`)
- ❌ Python scripts (`py_scripts/`)
- ❌ Tests (`ts_tests/`, `__tests__/`)
- ❌ Node modules
- ❌ Development files

## Git Tracking

### Tracked Files
- Source code (`src/`)
- Documentation (`docs/`)
- Analysis tools (`py_scripts/`, `ts_tests/`)
- Configuration files
- README files

### Ignored Files (`.gitignore`)
- `node_modules/` - Dependencies
- `dist/` - Built files
- `__pycache__/` - Python cache
- `*.wrcdata` - Session data
- `.env` - Environment variables
- Editor files (`.vscode/`, etc.)

## File Naming Conventions

### TypeScript/React
- Components: `PascalCase.tsx` + `PascalCase.css`
- Hooks: `useCamelCase.ts`
- Utilities: `camelCase.ts`
- Tests: `Feature.test.ts`

### Python
- Scripts: `snake_case.py`
- Test scripts: `test_snake_case.py`

### Documentation
- All caps with underscores: `FEATURE_GUIDE.md`
- Or Pascal Case: `ProjectOrganization.md`
- Always `.md` extension

## Size Optimization

### Current Build Size
```
dist/
├── assets/
│   ├── index-[hash].css  ~16 KB (3.9 KB gzipped)
│   └── index-[hash].js   ~236 KB (72 KB gzipped)
├── sw.js                 ~2 KB
├── workbox-*.js          ~21 KB
└── manifest, icons       ~10 KB
────────────────────────────────
Total:                    ~285 KB (~95 KB gzipped)
```

### Optimization Techniques
- Tree shaking (removes unused code)
- Code splitting (separate chunks)
- Minification (uglify code)
- Gzip compression (70% reduction)
- Asset caching (1 year for static files)
- Service worker precaching

## Data Flow

### Recording Session
```
Phone Sensors → Hooks → Filters → Detection → UI + Storage
     ↓                                              ↓
  IMU/GPS                                    localStorage
                                                    ↓
                                          SessionStorage Hook
```

### Exporting Session
```
localStorage → SessionPanel → BinaryDataWriter → File/Share API
                                                       ↓
                                              .wrcdata file
                                                       ↓
                                            Python Scripts
                                                       ↓
                                           Analysis/Visualization
```

## Development Workflow

### Feature Development
1. Create feature in `src/lib/feature/`
2. Write unit tests in `src/lib/feature/__tests__/`
3. Create React component in `src/components/`
4. Update hooks if needed
5. Test in dev mode
6. Document in `docs/`

### Testing Workflow
1. Unit tests: `npm test`
2. Integration: Run simulation in `ts_tests/`
3. Manual: Test in PWA dev server
4. Real data: Record session on phone
5. Analysis: Export and run Python scripts

### Deployment Workflow
1. Develop and test locally
2. Commit to git
3. Push to repository
4. CapRover auto-builds from Dockerfile
5. Zero-downtime deployment
6. Test on production URL

## Storage Locations

### Browser (Client-side)
- **localStorage**: Session data, settings
- **Service Worker Cache**: PWA assets, offline files
- **IndexedDB**: Not currently used (potential future use)

### Server (CapRover)
- **Nginx**: Serves static PWA files
- **No database**: PWA is entirely client-side
- **No user data**: All data stored in browser

### User Exports
- **Phone storage**: Downloaded .wrcdata files
- **Cloud storage**: User-shared files (Drive, iCloud, etc.)
- **Computer**: Copied via cable/AirDrop

## Security Considerations

### Client-Side Security
- HTTPS required for PWA
- Service Worker scope limited
- localStorage isolated per origin
- No sensitive data stored
- CORS headers configured

### Server-Side Security
- Nginx security headers
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- XSS protection enabled
- No server-side code execution

### Data Privacy
- All data stays local
- No analytics or tracking
- No third-party requests
- Explicit export only
- User controls all data

## Performance Targets

### Load Performance
- First Contentful Paint: <1s
- Time to Interactive: <2s
- Lighthouse Score: >90

### Runtime Performance
- Sensor sampling: 50 Hz (20ms interval)
- UI updates: 20 FPS (50ms interval)
- Smooth animations: 60 FPS when idle
- Memory usage: <100 MB

### Offline Performance
- Instant load from cache
- Full functionality offline
- GPS requires network (hardware)
- Session storage persists

## Browser Compatibility

### Supported Browsers
- ✅ Chrome/Edge 90+
- ✅ Safari 15+ (iOS/macOS)
- ✅ Firefox 88+
- ✅ Samsung Internet 14+

### Required APIs
- ✅ Service Workers
- ✅ Web App Manifest
- ✅ DeviceMotion API
- ✅ Geolocation API
- ✅ localStorage
- ✅ Web Share API (mobile)

### Progressive Enhancement
- Core features work on all modern browsers
- Share API falls back to download
- Offline mode gracefully degrades

## Maintenance Schedule

### Regular Updates
- **Weekly**: Dependency security checks
- **Monthly**: Test on latest browsers
- **Quarterly**: Major dependency updates
- **Yearly**: Architecture review

### Monitoring
- Browser console errors
- Service worker activation
- localStorage usage
- User-reported issues

---

## Quick Reference

**Start Development:**
```bash
npm run dev
```

**Run Tests:**
```bash
npm test
```

**Build for Production:**
```bash
npm run build
```

**Deploy to CapRover:**
```bash
caprover deploy
```

**Analyze Session Data:**
```bash
python py_scripts/visualize_wrcdata.py session.wrcdata
```

**Generate GPS Map:**
```bash
python py_scripts/create_gps_map.py session.wrcdata
```

---

For more information, see `docs/README.md` for complete documentation index.

