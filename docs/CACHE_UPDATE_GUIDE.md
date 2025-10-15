# Cache Update Guide - Force PWA Update

## The Problem

After deploying a new version, users may see the old app because of:
1. **Service Worker caching** - PWA caches files for offline use
2. **Browser caching** - Browser caches HTML/JS/CSS
3. **Install cache** - Installed PWA keeps old version

## The Solution - What We Fixed

### 1. Nginx Cache Headers (Fixed)
```nginx
# index.html - NEVER cache
location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    expires 0;
}

# Service Worker - NEVER cache
location /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    expires 0;
}

# Workbox - NEVER cache
location ~* ^/workbox-.*\.js$ {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    expires 0;
}

# Hashed assets - CAN cache (filename changes)
location ~* ^/assets/.*\.(js|css)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 2. Service Worker Strategy (Fixed)
```typescript
VitePWA({
  registerType: 'autoUpdate',     // Auto-update on new version
  workbox: {
    skipWaiting: true,             // Activate new SW immediately
    clientsClaim: true,            // Take control of pages immediately
    cleanupOutdatedCaches: true    // Remove old caches
  }
})
```

## How to Force Update on Phone

### Method 1: Hard Refresh (Fastest)

**iOS Safari:**
1. Open the PWA
2. Pull down to show URL bar
3. Long press the reload button (🔄)
4. Tap "Request Desktop Site" then reload again
5. Or: Settings → Safari → Clear History and Website Data

**Android Chrome:**
1. Open the PWA
2. Three dots menu → Settings
3. Site settings → Clear & reset
4. Or: Chrome Settings → Privacy → Clear browsing data

### Method 2: Unregister Service Worker

**iOS (Safari DevTools via Mac):**
1. Connect iPhone to Mac
2. Enable Web Inspector: iPhone Settings → Safari → Advanced → Web Inspector
3. Mac Safari → Develop → [Your iPhone] → WRC Coach
4. Console: `navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()))`
5. Refresh page

**Android (Chrome DevTools):**
1. Chrome → chrome://inspect/#devices
2. Find your device
3. Click "inspect" on WRC Coach
4. Application tab → Service Workers → Unregister
5. Refresh page

### Method 3: Clear All App Data

**iOS:**
1. Remove PWA from home screen (long press → Remove App)
2. Safari → Settings → Clear History and Website Data
3. Visit site in Safari again
4. Add to Home Screen

**Android:**
1. Settings → Apps → WRC Coach
2. Storage → Clear Storage
3. Or: Remove from home screen
4. Chrome → Clear browsing data
5. Visit site again
6. Install PWA again

### Method 4: Wait (Slowest)
- Service Worker checks for updates when app opens
- New version will auto-install on next launch
- May take 24 hours depending on browser

## For Developers: Force Immediate Update

### During Development
```bash
# Build with new version
npm run build

# Deploy
caprover deploy

# Clear CapRover cache (if needed)
caprover logs -a wrc-coach --clear-cache
```

### Version Bump (Recommended)
Update `package.json`:
```json
{
  "version": "2.1.0"  // Increment on each release
}
```

This changes manifest hash, forcing update.

### Manual Cache Bust
Add query parameter to force reload:
```
https://your-domain.com/?v=2
```

Browser treats this as new URL, bypassing cache.

## Verification Steps

### 1. Check Version Deployed
```bash
# Check what's running
curl https://your-domain.com/index.html | grep -o 'assets/index-[^"]*'

# Should show NEW hash, e.g.:
# assets/index-DRF82Hdn.js  (new)
# NOT: assets/index-CFB-RCkW.js  (old)
```

### 2. Check Service Worker
Browser DevTools → Application → Service Workers
- Should show "activated and running"
- Check "Update on reload"
- Click "Update" button

### 3. Check Cache Headers
```bash
# index.html should have no-cache
curl -I https://your-domain.com/index.html | grep -i cache-control
# Expected: Cache-Control: no-cache, no-store, must-revalidate

# sw.js should have no-cache
curl -I https://your-domain.com/sw.js | grep -i cache-control
# Expected: Cache-Control: no-cache, no-store, must-revalidate

# Assets should have long cache
curl -I https://your-domain.com/assets/index-XXX.js | grep -i cache-control
# Expected: Cache-Control: public, immutable
```

### 4. Verify Update on Phone

**Look for:**
- ✅ New UI elements (e.g., Sessions button instead of Calibrate)
- ✅ New features work (session management, share button)
- ✅ Updated version in settings/about
- ✅ Console shows new build hash

**Red flags:**
- ❌ Old UI still showing
- ❌ Missing new features
- ❌ Console errors about missing modules
- ❌ Old service worker version in DevTools

## User Instructions (Simple)

**To get the latest version:**

**iPhone:**
1. Remove app from home screen
2. Safari → Settings → Clear History
3. Visit [your-url] in Safari
4. Add to Home Screen again

**Android:**
1. Settings → Apps → WRC Coach → Clear Storage
2. Visit [your-url] in Chrome
3. Install app again

**Or just wait:** New version will auto-update within 24 hours

## Preventing Future Issues

### Best Practices
1. ✅ **Increment version** in package.json on each release
2. ✅ **Test deployment** on phone before announcing
3. ✅ **Document changes** in release notes
4. ✅ **Notify users** of major updates
5. ✅ **Use semantic versioning** (MAJOR.MINOR.PATCH)

### Cache Strategy Summary

**NEVER Cache (always fresh):**
- index.html
- sw.js (Service Worker)
- workbox-*.js
- manifest.webmanifest (short cache: 1 hour)

**CAN Cache (filename has hash):**
- /assets/index-{hash}.js
- /assets/index-{hash}.css
- Images, fonts, icons

**How it works:**
1. Browser loads index.html (no cache)
2. index.html references /assets/index-ABC123.js
3. On update, new build creates index-XYZ789.js
4. index.html now references NEW file
5. Browser downloads new file (old cached version ignored)

## Debugging Cache Issues

### Check What's Cached

**Browser Console:**
```javascript
// List all caches
caches.keys().then(console.log)

// Clear all caches
caches.keys().then(keys => 
  Promise.all(keys.map(key => caches.delete(key)))
)

// Check specific cache
caches.open('workbox-precache-v2-...').then(cache => 
  cache.keys().then(console.log)
)
```

### Check Service Worker Status

**Browser Console:**
```javascript
// Check registration
navigator.serviceWorker.getRegistrations().then(console.log)

// Check active service worker
navigator.serviceWorker.controller

// Force update
navigator.serviceWorker.getRegistrations().then(regs => 
  regs.forEach(reg => reg.update())
)
```

### Common Issues

**Issue: "Update deployed but phone shows old version"**
- **Cause:** Service Worker cached
- **Fix:** Unregister SW or clear app data

**Issue: "Some features work, others don't"**
- **Cause:** Partial cache update
- **Fix:** Clear all caches, reload

**Issue: "Works in Safari, not in PWA"**
- **Cause:** PWA has separate cache
- **Fix:** Reinstall PWA

**Issue: "Update works on desktop, not mobile"**
- **Cause:** Mobile browser aggressive caching
- **Fix:** Clear mobile browser data

## Monitoring Updates

### User Metrics to Track
- [ ] % users on latest version
- [ ] Time to update (median)
- [ ] Update failures
- [ ] Cache-related errors

### Server Logs
```bash
# Check which versions are being served
tail -f /var/log/nginx/access.log | grep "assets/index"

# Should see NEW hash increasing over time
```

### Analytics (Optional)
Add version to app:
```typescript
const APP_VERSION = '2.1.0';
console.log('WRC Coach version:', APP_VERSION);
```

Track in analytics or error reporting.

## Quick Reference

**Deploy new version:**
```bash
1. npm run build
2. caprover deploy
3. Wait 30 seconds
4. Test: curl https://domain.com/index.html
5. Verify new hash in assets/
```

**Force update on phone:**
```bash
iOS: Remove app → Clear Safari → Reinstall
Android: Clear app storage → Reinstall
```

**Verify cache headers:**
```bash
curl -I https://domain.com/index.html
# Should see: Cache-Control: no-cache, no-store, must-revalidate
```

**Check what's running:**
```bash
# On server
docker ps | grep wrc-coach
docker logs [container-id] | tail -20

# From client
curl https://domain.com/health
```

---

## Summary

**The fix ensures:**
1. ✅ index.html never cached (always fresh)
2. ✅ Service Worker never cached (can update)
3. ✅ New SW activates immediately (skipWaiting: true)
4. ✅ Old caches cleaned automatically
5. ✅ Hashed assets cached safely (filename changes)

**Users will now:**
- See updates within 24 hours (automatic)
- Can force update by reinstalling
- No more "stuck on old version" issue

**Next deployment will work correctly! 🚀**

