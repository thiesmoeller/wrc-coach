# Safe Automatic Update Mechanism

## Overview

The WRC Coach PWA is configured to automatically check for and apply updates **safely** - it will never interrupt an active recording session. When you deploy a new version, clients detect it immediately but only apply it when it's safe to do so.

## How It Works

### 1. Service Worker Configuration (`vite.config.ts`)

```typescript
VitePWA({
  registerType: 'autoUpdate',
  injectRegister: false,  // Manual registration for better control
  workbox: {
    skipWaiting: true,      // New SW activates immediately
    clientsClaim: true,     // Takes control of all clients immediately
    cleanupOutdatedCaches: true,
  }
})
```

### 2. Recording State Tracking (`src/App.tsx`)

When a session starts/stops, the app tracks it in sessionStorage:

```typescript
// On Start:
sessionStorage.setItem('wrc_recording_active', 'true');

// On Stop:
sessionStorage.removeItem('wrc_recording_active');
```

This allows the update mechanism to know when it's safe to reload.

### 3. Smart Update Registration (`src/main.tsx`)

The app implements an intelligent service worker registration that:

- ✅ **Registers the service worker** on page load
- ✅ **Checks for updates immediately** after registration
- ✅ **Polls for updates every 60 seconds** while the app is open
- ✅ **Detects if recording is active** before applying updates
- ✅ **Defers reload** if a session is in progress
- ✅ **Shows visual notification** when update is waiting
- ✅ **Auto-applies update** within 5 seconds after recording stops
- ✅ **Logs everything** to console for debugging

### 4. Update Notification UI (`src/components/UpdateNotification.tsx`)

A floating notification appears when an update is ready:

- 🔵 **While Recording**: "Update Available - Will apply when you stop recording"
- ⚡ **When Idle**: "Update Available - Ready to install" + "Update Now" button

### 3. Update Flow

#### When NOT Recording:

```
1. User opens app (not recording)
   ↓
2. SW registers and checks for updates
   ↓
3. Every 60 seconds: Check for updates
   ↓
4. New version detected
   ↓
5. Console: "📦 New version found, installing..."
   ↓
6. New SW installed and activated (skipWaiting: true)
   ↓
7. Console: "✅ New version activated!"
   ↓
8. Console: "🔄 No active session, applying update now..."
   ↓
9. Page automatically reloads
   ↓
10. User sees new version
```

#### When Recording (SAFE MODE):

```
1. User is actively recording
   ↓
2. Update detected in background
   ↓
3. Console: "📦 New version found, installing..."
   ↓
4. New SW installed and activated
   ↓
5. Console: "⏸️ Update ready, but waiting for session to end..."
   ↓
6. 🔄 Blue notification banner appears: "Update Available - Will apply when you stop recording"
   ↓
7. User continues recording (NO INTERRUPTION!)
   ↓
8. User stops recording
   ↓
9. Within 5 seconds: Console: "✅ Session ended, applying pending update..."
   ↓
10. Page automatically reloads with new version
```

## Deployment Process

### Step 1: Build New Version

```bash
# Make your changes
git add .
git commit -m "Your changes"

# Optionally create a tag
git tag -a v2.0.2 -m "Version 2.0.2"

# Build
npm run build
```

### Step 2: Deploy

```bash
# Deploy the dist/ folder to your hosting
# (CapRover, Netlify, Vercel, etc.)
```

### Step 3: Automatic Update on Client

**For users with the app open:**
- Within 60 seconds, they'll see: `"🔄 Reloading to apply update..."`
- Their app automatically reloads with the new version

**For users who closed the app:**
- Next time they open it, they get the new version immediately

## Monitoring Updates

### In Production

Open the browser console to see update logs:

```
✅ Service Worker registered
🔄 Checking for updates...
📦 New version found, installing...
✅ New version activated!
🔄 Reloading to apply update...
```

### Testing Updates Locally

1. Build the app: `npm run build`
2. Serve the dist folder: `npm run preview` or use a local server
3. Open in browser
4. Make a change and rebuild
5. The app should detect and apply the update within 60 seconds

## Version Display

Users can check their current version in **Settings → Version Information**:

- **App Version**: From package.json
- **Git Tag**: Most recent git tag
- **Git Commit**: Short commit hash
- **Branch**: Current branch
- **Build Date**: When the app was built

## Troubleshooting

### Updates not applying?

1. **Check the console** - Look for update-related logs
2. **Check recording state** - Is `wrc_recording_active` set in sessionStorage?
3. **Check service worker status** - Chrome DevTools → Application → Service Workers
4. **Clear cache** - Unregister the SW and hard refresh (Ctrl+Shift+R)
5. **Check network** - Ensure the new version is actually deployed

### Recording interrupted by update?

**This should never happen!** The update mechanism specifically checks for active recordings. If it does happen:

1. Check browser console for error messages
2. Verify sessionStorage flags are being set correctly
3. Report the issue - this is a bug

### Multiple tabs open?

All tabs will reload when an update is detected AND no recording is active in any tab.

### Want to force update during recording?

Open browser console and run:

```javascript
sessionStorage.removeItem('wrc_recording_active');
sessionStorage.removeItem('wrc_update_waiting');
window.location.reload();
```

⚠️ **Warning**: This will lose any unsaved recording data!

## Technical Details

### Cache Strategy

- **Precache**: All app assets (JS, CSS, HTML, images)
- **Runtime Cache**: Google Fonts (CacheFirst, 1 year)
- **Update Check**: Every 60 seconds while app is open
- **Activation**: Immediate (skipWaiting + clientsClaim)

### Browser Support

- ✅ Chrome/Edge (Desktop & Android)
- ✅ Firefox
- ✅ Safari (iOS 11.3+)
- ⚠️ Opera, Samsung Internet (should work, but test)

### Performance Impact

- **Initial load**: Slightly slower (SW registration)
- **Subsequent loads**: Much faster (cached assets)
- **Update check**: Negligible (background fetch every 60s)
- **Memory**: ~2-5MB for cached assets

## Best Practices

1. ✅ **Tag your releases** - Use semantic versioning (v2.0.1, v2.0.2, etc.)
2. ✅ **Test before deploying** - Build and preview locally first
3. ✅ **Monitor console logs** - Check for errors during updates
4. ✅ **Keep build artifacts** - Save old dist/ folders for rollback
5. ✅ **Document breaking changes** - Warn users if data migration is needed

## Future Enhancements

Possible improvements:

- [ ] Show update toast notification before reload
- [ ] Allow user to defer update
- [ ] Show version changelog in app
- [ ] Add update progress indicator
- [ ] Implement staged rollouts
- [ ] Add A/B testing capability

