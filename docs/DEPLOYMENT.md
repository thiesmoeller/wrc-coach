# Deployment Guide

## CapRover Deployment

### Prerequisites
- CapRover instance running
- Docker installed locally (for testing)
- Git repository configured

### Deployment Steps

#### 1. Build & Deploy via CapRover CLI

```bash
# Install CapRover CLI (if not already installed)
npm install -g caprover

# Deploy to CapRover
caprover deploy
```

#### 2. Manual Deployment

```bash
# Build locally
npm run build

# Deploy built files
# (CapRover will use Dockerfile to build and serve)
```

### Dockerfile Configuration

The project includes a multi-stage Dockerfile:

**Stage 1: Builder**
- Uses Node.js 20 Alpine
- Installs dependencies (`npm ci`)
- Builds the PWA (`npm run build`)
- Outputs to `/app/dist`

**Stage 2: Production**
- Uses nginx:alpine
- Copies built files from builder
- Serves static PWA files
- Includes custom nginx configuration

### CapRover Configuration

**captain-definition file:**
```json
{
  "schemaVersion": 2,
  "dockerfilePath": "./Dockerfile"
}
```

This tells CapRover to:
1. Use the Dockerfile in the repository root
2. Build the app during deployment
3. Deploy the resulting container

### Nginx Configuration

Custom nginx config (`nginx.conf`) includes:

**PWA Support:**
- Service Worker caching headers
- Manifest file serving
- Offline support

**Performance:**
- Gzip compression
- Static asset caching (1 year)
- Optimized cache headers

**Security:**
- Security headers (X-Frame-Options, etc.)
- Content-Type protection
- XSS protection

**SPA Routing:**
- Fallback to index.html for client-side routing

### Environment Variables

No environment variables needed for basic deployment.

Optional:
- `PORT` - Override default port (default: 80)
- `NODE_ENV` - Set to 'production' (automatic in CapRover)

### Health Check

The deployment includes a health check endpoint:
```
GET /health
Response: 200 "OK"
```

Used by:
- Docker health checks (every 30s)
- Load balancers
- Monitoring tools

### Post-Deployment Verification

#### 1. Check PWA Installation
Visit your deployed URL:
- Look for "Install" prompt in browser
- Check manifest loads: `https://your-domain.com/manifest.webmanifest`
- Verify service worker: DevTools → Application → Service Workers

#### 2. Test Offline Functionality
- Load the app
- Turn off network (DevTools → Network → Offline)
- App should still work

#### 3. Mobile Testing
On iOS/Android:
- Visit site in Safari/Chrome
- Tap "Share" → "Add to Home Screen"
- Launch from home screen
- Should feel like native app (no browser chrome)

### Troubleshooting

#### Build Fails
```bash
# Test build locally first
npm run build

# Check for TypeScript errors
npm run build 2>&1 | grep "error TS"
```

#### PWA Not Installing
- Check manifest syntax: `https://your-domain.com/manifest.webmanifest`
- Verify HTTPS (required for PWA)
- Check service worker registration in DevTools

#### Static Files 404
- Verify nginx.conf copied correctly
- Check file permissions in container
- Ensure dist/ folder built correctly

#### Service Worker Not Updating
- Check cache headers on sw.js (should be no-cache)
- Force refresh (Ctrl+Shift+R)
- Unregister old service worker in DevTools

### Updating the Deployment

```bash
# Make changes to code
git add .
git commit -m "Update feature"
git push

# Deploy new version
caprover deploy

# Or push to trigger auto-deploy (if configured)
git push origin main
```

CapRover will:
1. Pull latest code
2. Build new Docker image
3. Deploy new container
4. Zero-downtime deployment

### Build Optimization

**Current build output:**
```
dist/
├── assets/
│   ├── index-[hash].css  (~16 KB)
│   └── index-[hash].js   (~236 KB)
├── sw.js                 (Service Worker)
├── manifest.webmanifest  (PWA Manifest)
├── icon.svg             (App Icon)
└── index.html           (Entry Point)
```

**Optimization tips:**
- Code splitting enabled automatically
- Tree shaking removes unused code
- Source maps for debugging (can disable in production)
- Gzip reduces transfer size by ~70%

### SSL/HTTPS Configuration

CapRover handles SSL automatically:
1. Enable HTTPS in CapRover dashboard
2. Add domain
3. Enable Force HTTPS redirect
4. Let's Encrypt certificate auto-issued

PWA **requires HTTPS** to work (except localhost).

### Monitoring

**Key Metrics:**
- Response time: Should be <100ms for static files
- Service Worker activation: Check registration rate
- Offline usage: Monitor failed network requests
- Install rate: Track "Add to Home Screen" events

**Logs:**
```bash
# View deployment logs
caprover logs appname

# View nginx access logs
caprover logs appname --follow

# View build logs
caprover logs appname --build
```

### Rollback

If deployment fails:
```bash
# View previous deployments
caprover list

# Rollback to previous version
caprover rollback appname
```

Or in CapRover dashboard:
1. Go to app
2. Deployment tab
3. Click "Rollback" on previous version

### Performance Tuning

**Nginx optimizations already included:**
- Gzip compression (level 6)
- Static asset caching (immutable)
- Connection keep-alive
- Sendfile enabled

**Additional optimizations:**
- CDN for static assets (optional)
- Image optimization (icons already SVG)
- Code splitting (already enabled)
- Lazy loading (in React components)

### Security Checklist

✅ **Included:**
- HTTPS enforcement (via CapRover)
- Security headers (X-Frame-Options, etc.)
- Content-Type protection
- XSS protection

**Additional (optional):**
- Content Security Policy (CSP)
- Rate limiting
- DDoS protection
- WAF (Web Application Firewall)

### Backup & Recovery

**What to backup:**
- Git repository (source of truth)
- CapRover configuration
- Domain settings
- SSL certificates (auto-renewed)

**User data:**
- Stored in browser localStorage
- Users must export sessions manually
- No server-side storage needed

### Custom Domain Setup

1. **Add domain in CapRover:**
   - Go to app settings
   - Add custom domain
   - Enable HTTPS

2. **DNS Configuration:**
   ```
   Type: A
   Name: @ (or subdomain)
   Value: [CapRover IP]
   TTL: 3600
   ```

3. **Verify:**
   - DNS propagation (can take 24-48 hours)
   - SSL certificate issued
   - HTTPS redirect working

### Multi-Environment Setup

**Development:**
```bash
npm run dev
# Runs on localhost:3000
```

**Staging:**
```bash
# Deploy to staging app in CapRover
caprover deploy -a wrc-coach-staging
```

**Production:**
```bash
# Deploy to production app
caprover deploy -a wrc-coach-prod
```

### CI/CD Integration

**GitHub Actions example:**
```yaml
name: Deploy to CapRover
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to CapRover
        uses: caprover/deploy-from-github@v1.0.1
        with:
          server: '${{ secrets.CAPROVER_SERVER }}'
          app: 'wrc-coach'
          token: '${{ secrets.CAPROVER_TOKEN }}'
```

### Maintenance

**Regular tasks:**
- ✅ Monitor disk space (logs, cache)
- ✅ Check for Vite/React updates
- ✅ Review dependency vulnerabilities (`npm audit`)
- ✅ Test PWA functionality monthly
- ✅ Verify SSL certificate renewal

**Update dependencies:**
```bash
# Check for updates
npm outdated

# Update all
npm update

# Test
npm run build
npm run test
```

---

## Quick Deployment Checklist

Before deployment:
- [ ] Run `npm run build` successfully
- [ ] Test PWA locally (`npm run preview`)
- [ ] Verify .dockerignore excludes unnecessary files
- [ ] Ensure nginx.conf is present
- [ ] Check captain-definition is correct
- [ ] Test on mobile device (local network)
- [ ] Commit all changes to git

After deployment:
- [ ] Verify HTTPS working
- [ ] Test PWA installation
- [ ] Check service worker active
- [ ] Test offline functionality
- [ ] Verify session storage works
- [ ] Test share/export functionality
- [ ] Check on iOS and Android
- [ ] Monitor error logs for 24 hours

**You're ready to deploy! 🚀**

