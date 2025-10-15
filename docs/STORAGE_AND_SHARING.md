# Session Storage & Sharing

## Storage Location

### Where Sessions Are Stored
- **Browser localStorage** under key: `wrc_coach_sessions`
- **Persists across**:
  - ✅ App restarts
  - ✅ Browser refreshes
  - ✅ PWA updates
  - ✅ Device reboots
  - ✅ Airplane mode
  - ✅ Offline mode

### Data Structure
Each session contains:
```javascript
{
  id: "session_timestamp_randomid",
  timestamp: 1234567890,           // When session was saved
  sessionStartTime: 1234567890,    // When recording started
  duration: 180000,                 // Duration in ms
  samples: [...],                   // All IMU and GPS samples
  avgStrokeRate: 28.5,
  avgDrivePercent: 42.3,
  maxSpeed: 5.2,
  totalDistance: 2500,
  strokeCount: 85,
  phoneOrientation: 'rower',
  demoMode: false,
  catchThreshold: 0.6,
  finishThreshold: -0.3,
  calibrationData: {...}
}
```

### Storage Limits
- **Browser quota**: Typically 5-10 MB per app
- **Auto-cleanup**: Removes oldest session if storage full
- **Manual cleanup**: Delete sessions in Sessions panel

### Data Safety
- **Local only**: Data never leaves your device
- **No cloud sync**: Must manually export to backup
- **Survives app updates**: Data persists through PWA updates
- **Lost if**: Browser cache cleared OR app uninstalled

## Sharing / Export Functionality

### Native Share (Mobile) 📤

On **iOS and Android**, clicking "📤 Share" opens the native share sheet:

**iOS Options**:
- AirDrop to nearby Mac/iPhone
- Save to Files app
- Share via Messages/Email
- Upload to iCloud Drive
- Send to other apps

**Android Options**:
- Share via Nearby Share / Quick Share
- Save to Google Drive / Dropbox
- Share via WhatsApp/Telegram/Email
- Send via Bluetooth
- Save to Downloads folder

### Traditional Download (Desktop) 💾

On **desktop browsers**, clicking "📤 Share":
- Downloads `.wrcdata` file directly
- Saves to your Downloads folder
- Standard browser download behavior

### How It Works

```typescript
// Priority order:
1. Try Web Share API (if available on mobile)
   → Opens native share sheet
   → User picks destination
   
2. Fallback to download (desktop or if share fails)
   → Creates download link
   → Auto-downloads file
```

### File Format
- **Filename**: `wrc_coach_YYYY-MM-DDTHH-MM-SS.wrcdata`
- **Type**: Binary format (custom WRC format)
- **Size**: Varies based on session length (typically 100KB - 5MB)
- **Contains**: Full IMU data, GPS data, session metadata

## Usage Scenarios

### Scenario 1: Share to Computer (iOS)
1. Record session on iPhone
2. Click Sessions → 📤 Share on session
3. Select **AirDrop**
4. Choose your Mac
5. File appears in Downloads on Mac

### Scenario 2: Save to Cloud (Android)
1. Record session on Android phone
2. Click Sessions → 📤 Share on session
3. Select **Google Drive**
4. Choose folder and save
5. Access from any device

### Scenario 3: Desktop Export
1. Run PWA on desktop browser
2. Record session (or use demo mode)
3. Click Sessions → 📤 Share on session
4. File downloads to Downloads folder
5. Analyze with Python scripts

### Scenario 4: Bulk Export
1. After training session with multiple pieces
2. Go through session list
3. Click 📤 Share on each important session
4. Choose same destination (e.g., same folder in Files app)
5. All sessions collected in one place

## Data Backup Best Practices

### Recommended Workflow
1. **During outing**: Focus on recording sessions
2. **After outing**: Share all important sessions to:
   - Computer via AirDrop/cable
   - Cloud storage (Google Drive, iCloud, Dropbox)
   - Email to yourself
3. **Once backed up**: Delete old sessions from app to free space

### Why Backup?
- localStorage can be cleared by:
  - User clearing browser cache
  - System storage cleanup (rare)
  - Uninstalling PWA
- **No automatic backup** - you must manually export

### Storage Strategy
**On Device** (temporary):
- Keep recent sessions for quick review
- Delete after backing up
- Monitor storage in Sessions panel

**Off Device** (permanent):
- Cloud storage for long-term
- Computer backup
- Multiple locations for important data

## Checking Storage Status

### How to Monitor
1. Open **Sessions** panel
2. Count number of sessions
3. Note timestamp of oldest session
4. Watch for storage warnings

### Signs of Full Storage
- "Storage full! Please delete some sessions." alert
- Oldest session auto-deleted when saving new one
- Can't save new sessions

### Cleanup Steps
1. Export important sessions first
2. Click 🗑️ Delete on old/test sessions
3. Use "Clear All" for complete reset (careful!)
4. Verify space freed by saving test session

## Technical Details

### Web Share API Support
- **iOS Safari**: ✅ Full support (iOS 12.2+)
- **Android Chrome**: ✅ Full support
- **Desktop Chrome**: ⚠️ Limited (some platforms)
- **Desktop Safari**: ❌ No file sharing
- **Firefox**: ❌ Falls back to download

### localStorage Limits by Browser
- **Safari (iOS)**: ~5 MB
- **Chrome (Android)**: ~10 MB
- **Desktop browsers**: ~10 MB
- **Actual limit**: Depends on available device storage

### What Happens When Full?
```javascript
1. Try to save session
2. localStorage.setItem() throws QuotaExceededError
3. App catches error
4. Removes oldest session automatically
5. Retries save
6. If still fails, shows alert
```

## Troubleshooting

### "Share button does nothing"
- Check browser console for errors
- Ensure file is not too large (>10MB)
- Try different share target
- Fallback: Use desktop to download instead

### "Session disappeared after restart"
- Check if browser cache was cleared
- Verify app was properly closed (not force-closed)
- Check browser's "Clear on exit" settings
- **Prevention**: Export immediately after important sessions

### "Can't share to specific app"
- App may not accept `.wrcdata` files
- Workaround: Share to Files app first, then forward
- Or: Share via email (accepts any file type)

### "Storage full despite deleting sessions"
- Browser cache may need refresh
- Close and reopen PWA
- Check browser storage settings
- Last resort: Clear site data (loses all sessions!)

## Migration & Updates

### PWA Updates
- Sessions survive app updates ✅
- New app version loads existing sessions
- No data migration needed

### Browser Changes
- Switching browsers loses data ❌
- Moving devices loses data ❌
- **Must export before switching**

### Data Portability
- Export all sessions before:
  - Changing phones
  - Switching browsers  
  - Major OS updates
  - Uninstalling PWA

## Future Enhancements (Potential)

- [ ] Cloud sync option
- [ ] Automatic backup to cloud
- [ ] Session import from file
- [ ] Multiple session export (zip)
- [ ] Storage usage indicator
- [ ] Export to CSV/JSON formats

---

**Key Takeaway**: Sessions are stored locally in your browser and survive restarts, but you MUST export important sessions to ensure long-term backup!

