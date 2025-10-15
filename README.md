# WRC Coach 2.0 - Modern Rowing Performance App

A Progressive Web App for real-time rowing performance feedback at Wilhelmsburger Ruder Club (est. 1895). Built with React + TypeScript + Vite.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev

# Build for production
npm run build
```

## ✨ Features

- 📊 Real-time stroke analysis
- 📈 Performance metrics (stroke rate, drive %, split time)
- 🎯 Advanced signal processing (Kalman, Complementary filters)
- 💾 Efficient binary data format (.wrcdata)
- 📱 PWA with offline support
- 🧪 Fully tested algorithm libraries

## 🏗️ Architecture

### Modular Library Design

All rowing algorithms are extracted into independent, testable libraries:

```
src/lib/
├── filters/           Signal processing
├── stroke-detection/  Stroke analysis
├── data-storage/      Binary format
└── transforms/        Coordinate systems
```

### Use Algorithms Standalone

```typescript
import { StrokeDetector } from './src/lib/stroke-detection';
import { KalmanFilterGPS } from './src/lib/filters';

const detector = new StrokeDetector();
const filter = new KalmanFilterGPS();

// Use in Node.js, CLI tools, etc.!
```

## 📚 Documentation

- **[GETTING_STARTED.md](GETTING_STARTED.md)** - Quick start guide
- **[LIBRARY_USAGE.md](LIBRARY_USAGE.md)** - Use algorithms standalone
- **[MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)** - Migration details
- **[REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md)** - What changed

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test -- --watch

# With coverage
npm run test -- --coverage
```

All algorithms have unit tests. 16 tests currently passing!

## 🔧 Tech Stack

- **React 19** - UI framework
- **TypeScript 5.9** - Type safety
- **Vite 7** - Build tool
- **Vitest 3** - Testing
- **PWA Plugin** - Offline support

## 📦 Build Output

```bash
npm run build
# Optimized bundle in dist/
# PWA with service worker
# ~210KB JS (gzipped: ~65KB)
```

## 🎯 Key Benefits

1. ✅ **Testable** - Every algorithm has unit tests
2. ✅ **Reusable** - Use libraries anywhere (Node.js, CLI, etc.)
3. ✅ **Type-safe** - Full TypeScript coverage
4. ✅ **Modern** - React + Vite + PWA
5. ✅ **Fast** - Hot reload in <50ms

## 📱 Usage

### As Web App
1. Open `http://localhost:3000` after `npm run dev`
2. Grant sensor permissions
3. Start rowing session

### As Library
```typescript
import { StrokeDetector } from './src/lib/stroke-detection';

const detector = new StrokeDetector({
  catchThreshold: 0.6,
  finishThreshold: -0.3
});

const stroke = detector.process(timestamp, acceleration);
```

## 🏆 What's New in 2.0

- ✅ Migrated from monolithic JS to React + TypeScript
- ✅ Extracted algorithms into testable libraries
- ✅ Full test coverage for core algorithms
- ✅ Modern build pipeline with Vite
- ✅ PWA with auto-generated service worker

## 📝 License

MIT License - Feel free to modify and use for your rowing club!

## 🙏 Acknowledgments

Built for Wilhelmsburger Ruder Club (WRC). Demonstrates best practices for extracting algorithms from legacy code into modern, testable, reusable libraries.

---

**Version**: 2.0.0  
**Tests**: ✅ 16/16 passing  
**Build**: ✅ Successful
