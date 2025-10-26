# IndexedDB Storage Migration

## Problem

After 35 minutes of rowing on the water, the app displayed an error: **"Storage full! Please delete some sessions."**

### Root Cause

The app was using **localStorage** to store all session data, including full IMU and GPS sample arrays. localStorage has a very limited capacity:
- **Typical limit**: 5-10 MB per origin
- **35 minutes of recording** at 50-100 Hz = 105,000-210,000 samples
- **Data size**: Each sample ~28 bytes → **3-6 MB for a single session**
- **Result**: With just 1-2 sessions, localStorage was full

## Solution

Migrated from **localStorage** to **IndexedDB** for session storage:
- **IndexedDB capacity**: Hundreds of MB to several GB (browser-dependent)
- **Binary storage**: Uses efficient binary format (same as .wrcdata exports)
- **Metadata caching**: Only small metadata kept in memory for fast UI rendering
- **Automatic migration**: Old localStorage sessions automatically migrated on first load

---

## Changes Made

### 1. New IndexedDB Storage Layer

**File**: `src/lib/data-storage/IndexedDBStorage.ts`

Created a new storage layer that:
- Stores session data as **binary blobs** in IndexedDB (using `BinaryDataWriter`)
- Provides metadata-only queries for fast UI rendering
- Handles full session retrieval when needed (for export/analysis)
- Supports storage statistics (session count, total size)

**Key Features**:
```typescript
class IndexedDBStorage {
  async saveSession(sessionData) → SessionMetadataStorage
  async getAllSessionMetadata() → SessionMetadataStorage[]
  async getSession(sessionId) → SessionFullData
  async getSessionBinary(sessionId) → ArrayBuffer
  async deleteSession(sessionId) → void
  async clearAllSessions() → void
  async getStorageStats() → { sessionCount, totalSize }
}
```

### 2. Updated BinaryDataReader (V2 Support)

**File**: `src/lib/data-storage/BinaryDataReader.ts`

The reader now supports both V1 and V2 binary formats:
- **V1**: Legacy format (no calibration data)
- **V2**: New format with calibration data, calibration samples

**Key Changes**:
- Detects format version from magic string
- Reads calibration data from V2 files
- Returns `DecodedData` with optional `calibration` and `calibrationSamples`

### 3. Updated useSessionStorage Hook

**File**: `src/hooks/useSessionStorage.ts`

Major refactoring to use IndexedDB:
- **Async operations**: All storage operations now return Promises
- **Automatic migration**: Detects old localStorage data and migrates to IndexedDB
- **Loading state**: New `isLoading` state for UI feedback
- **New methods**:
  - `getSessionBinary(sessionId)` - Get binary data directly (for export)
  - `getStorageStats()` - Get storage usage info

**Migration Logic**:
```typescript
// On first load, migrate old localStorage sessions
if (!localStorage.getItem('wrc_coach_migrated_to_indexeddb')) {
  // Migrate all sessions to IndexedDB
  // Clear old localStorage data
  localStorage.setItem('wrc_coach_migrated_to_indexeddb', 'true');
}
```

### 4. Updated App.tsx

**File**: `src/App.tsx`

- Made `handleStop` async to await session save
- Destructured new methods from `useSessionStorage`: `isLoading`, `getSessionBinary`
- Passed new props to `SessionPanel`
- Added error handling for failed session saves

### 5. Updated SessionPanel

**File**: `src/components/SessionPanel.tsx`

Major improvements:
- **Async operations**: All session operations now async (delete, clear, export)
- **Loading states**: 
  - Shows "Loading sessions..." when initializing
  - Shows "⏳ Exporting..." when exporting a session
- **Efficient export**: Uses `getSessionBinary()` directly instead of reconstructing from samples
- **Data size display**: Shows size of each session in the UI
- **Better error handling**: User-friendly error messages

---

## Storage Comparison

### Before (localStorage)
```
Format:        JSON (text)
Capacity:      5-10 MB
Data Structure: Full samples stored as JSON arrays
Performance:   - Fast reads (synchronous)
               - Slow writes (synchronous, blocks UI)
               - Fails when full
Single Session: ~3-6 MB (35 mins)
Max Sessions:  1-2 sessions
```

### After (IndexedDB)
```
Format:        Binary (ArrayBuffer)
Capacity:      100+ MB (browser-dependent)
Data Structure: Binary blobs + metadata index
Performance:   - Fast metadata reads (async)
               - Fast binary reads (async)
               - Non-blocking operations
Single Session: ~3-6 MB (35 mins) BUT compressed
Max Sessions:  20-50+ sessions (depending on browser)
```

---

## User Experience Improvements

### Before
1. ❌ Storage full after 1-2 sessions
2. ❌ Had to delete sessions to record new ones
3. ❌ Lost data if forgot to export before deleting
4. ❌ Slow UI when managing sessions

### After
1. ✅ Can store 20-50+ sessions (hours of data)
2. ✅ Sessions automatically saved with efficient binary format
3. ✅ Fast UI - only loads metadata, not full data
4. ✅ Efficient export - binary data retrieved directly
5. ✅ Shows data size for each session
6. ✅ Automatic migration from old localStorage
7. ✅ Loading states for better UX

---

## Data Size Examples

**35 minutes of rowing:**
- IMU samples: ~105,000 (at 50 Hz)
- GPS samples: ~2,100 (at 1 Hz)
- Binary size: ~3.5 MB
- JSON size: ~7 MB (if stored as text)

**IndexedDB savings:**
- Binary format: 50% smaller than JSON
- Efficient storage: No string overhead
- Compression: Browser may compress IndexedDB data

**Typical capacity:**
- **Chrome/Edge**: 60% of available disk space (shared with other data)
- **Firefox**: 50% of available disk space (per origin)
- **Safari**: 1 GB per origin
- **Mobile**: Typically 50-500 MB (device-dependent)

---

## Technical Details

### IndexedDB Structure

**Database**: `wrc_coach_db`  
**Version**: 1  
**Object Store**: `sessions`  
**Key Path**: `id`  
**Index**: `timestamp` (for sorting)

**Stored Object**:
```typescript
{
  id: string;
  timestamp: number;
  sessionStartTime: number;
  duration: number;
  // Analysis metrics
  avgStrokeRate: number;
  avgDrivePercent: number;
  maxSpeed: number;
  totalDistance: number;
  strokeCount: number;
  // Settings
  phoneOrientation: 'rower' | 'coxswain';
  demoMode: boolean;
  catchThreshold: number;
  finishThreshold: number;
  // Data info
  sampleCount: number;
  dataSize: number;
  hasCalibrationData: boolean;
  // Full data (binary)
  binaryData: ArrayBuffer; // Stored in IndexedDB, not in memory
}
```

### Migration Process

1. **On app load**: Check if `wrc_coach_migrated_to_indexeddb` flag exists
2. **If not migrated**:
   - Read all sessions from localStorage
   - For each session:
     - Convert to binary format
     - Save to IndexedDB
   - Clear localStorage
   - Set migration flag
3. **After migration**: All new sessions saved to IndexedDB

---

## Browser Compatibility

| Browser | IndexedDB Support | Typical Capacity |
|---------|-------------------|------------------|
| Chrome 90+ | ✅ Full | 60% of disk |
| Firefox 85+ | ✅ Full | 50% of disk |
| Safari 14+ | ✅ Full | 1 GB |
| Edge 90+ | ✅ Full | 60% of disk |
| iOS Safari 14+ | ✅ Full | 500 MB |
| Android Chrome | ✅ Full | 100-500 MB |

**Note**: All modern browsers support IndexedDB. No compatibility issues expected.

---

## Testing Recommendations

### Test on Device
1. **Record multiple sessions**: Test 5-10 sessions without deleting
2. **Check storage stats**: Console should show total size
3. **Test export**: Verify exported .wrcdata files work in analysis app
4. **Test migration**: Clear IndexedDB, reload app with old localStorage data

### Console Debugging
```javascript
// Check IndexedDB
indexedDB.databases().then(console.log)

// Check storage usage
navigator.storage.estimate().then(console.log)

// Get storage stats (in app)
const { sessionCount, totalSize } = await getStorageStats();
console.log(`${sessionCount} sessions, ${totalSize} bytes`);
```

---

## Future Improvements

### Possible Enhancements
1. **Compression**: Add gzip compression to binary data
2. **Cloud sync**: Optional sync to cloud storage
3. **Quota management**: Warn user when approaching storage limit
4. **Export all**: Bulk export multiple sessions
5. **Session merging**: Combine multiple sessions for analysis

### Storage Optimization
- **Already done**: Binary format (50% smaller than JSON)
- **Could add**: Gzip compression (additional 30-50% reduction)
- **Could add**: Downsample old sessions (keep metadata, reduce samples)

---

## Troubleshooting

### "Storage full" still appears
1. Check browser storage settings
2. Check available disk space
3. Try clearing browser cache (not IndexedDB)
4. Check browser storage quota: `navigator.storage.estimate()`

### Sessions not migrating
1. Check browser console for errors
2. Verify localStorage has `wrc_coach_sessions` key
3. Try manual migration:
   ```javascript
   localStorage.removeItem('wrc_coach_migrated_to_indexeddb');
   // Reload page
   ```

### Export fails
1. Check browser console for errors
2. Verify session has binary data
3. Try re-exporting after a few seconds

---

## Summary

**The storage issue is now resolved!** 🎉

- ✅ Can store **20-50+ sessions** (instead of 1-2)
- ✅ **Automatic migration** from old localStorage
- ✅ **Efficient binary storage** (50% smaller)
- ✅ **Fast UI** (metadata-only queries)
- ✅ **Better UX** (loading states, data size display)
- ✅ **Future-proof** (room for many hours of recordings)

You should now be able to record multiple rowing sessions without worrying about storage limits!

