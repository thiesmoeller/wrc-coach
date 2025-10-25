# Installation & Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Desktop or tablet device (recommended screen size: 1024px+)

## Installation Steps

### 1. Navigate to the analysis app directory

```bash
cd /home/thies/Projects/cursor_projects/wrc-coach/analysis-app
```

### 2. Install dependencies

```bash
npm install
```

This will install:
- React 19 (UI framework)
- TypeScript (type safety)
- Vite (build tool)

### 3. Start development server

```bash
npm run dev
```

The app will be available at: **http://localhost:3001**

### 4. Build for production (optional)

```bash
npm run build
```

Output will be in the `dist/` directory.

## Verification

After installation, verify everything works:

1. **Open browser** to http://localhost:3001
2. **Load test file** (if you have a .wrcdata file)
3. **Check visualizations** render correctly
4. **Adjust parameters** to verify real-time updates

## First-Time Usage

### Getting .wrcdata Files

If you don't have any .wrcdata files yet:

1. Open the WRC Coach PWA on your phone
2. Record a rowing session (or use demo mode)
3. Click "Export CSV" button
4. Transfer the `.wrcdata` file to your computer
5. Load it in the analysis app

### Test with Demo Data

The main PWA has demo mode that generates synthetic data:
1. Open PWA in browser
2. Enable "Demo Mode" in settings
3. Start a demo session
4. Export the data
5. Load in analysis tool

## Troubleshooting Installation

### Problem: npm install fails

**Solution 1:** Clear npm cache
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Solution 2:** Use specific Node version
```bash
nvm use 18
npm install
```

### Problem: Port 3001 already in use

**Solution:** Change port in `vite.config.ts`:
```typescript
server: {
  port: 3002,  // or any available port
}
```

### Problem: TypeScript errors

**Solution:** Ensure TypeScript is installed correctly
```bash
npm install -D typescript
npm run lint
```

### Problem: React not found

**Solution:** Reinstall dependencies
```bash
rm -rf node_modules
npm install
```

## Development Environment

### Recommended IDE

- **VS Code** with extensions:
  - ESLint
  - Prettier
  - TypeScript and JavaScript Language Features

### Browser DevTools

- Chrome DevTools (recommended for debugging)
- React DevTools extension (optional)

## Project Structure

```
analysis-app/
├── src/                    # Source code
│   ├── lib/               # Algorithms (shared with PWA)
│   ├── components/        # React components
│   ├── types.ts          # TypeScript types
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── public/               # Static assets (none yet)
├── index.html            # HTML template
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── vite.config.ts        # Vite config
└── README.md            # Documentation
```

## Running Tests (Future)

Once tests are added:

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm test -- --coverage # Coverage report
```

## Building for Different Environments

### Development Build
```bash
npm run dev
```
- Hot module reload
- Source maps
- Development warnings

### Production Build
```bash
npm run build
```
- Minified code
- Optimized assets
- Production-ready

### Preview Production Build
```bash
npm run build
npm run preview
```
- Test production build locally

## Environment Variables (Future)

If needed, create `.env` file:
```
VITE_API_URL=http://localhost:3000
VITE_ENABLE_DEBUG=true
```

## Docker Deployment (Future)

Dockerfile example:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "run", "preview"]
```

## Performance Tips

- Use production build for deployment
- Enable browser caching
- Serve over HTTPS
- Use CDN for static assets (if hosted)

## Security Considerations

- All processing is client-side (no data leaves browser)
- No external API calls
- No user authentication needed
- Safe to use with sensitive rowing data

## Updates & Maintenance

### Updating Dependencies
```bash
npm update           # Update all packages
npm outdated        # Check for outdated packages
```

### Keeping Algorithms in Sync

The algorithms in `src/lib/` should match the PWA:
1. Check PWA for algorithm updates
2. Copy changed files to analysis app
3. Test consistency between both apps

## Getting Help

- **README.md**: Full documentation
- **QUICKSTART.md**: Quick usage guide
- **docs/ANALYSIS_APP.md**: Technical details
- **GitHub Issues**: Report bugs or request features

## Next Steps

After successful installation:
1. Read **QUICKSTART.md** for usage instructions
2. Load your first .wrcdata file
3. Explore the different tabs
4. Experiment with parameter tuning
5. Compare results with PWA mobile app

---

Happy analyzing! 🚣‍♂️

