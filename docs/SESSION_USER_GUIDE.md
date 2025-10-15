# Session Management - Quick User Guide

## First Time on the Water 🚣

### Quick Start

1. **Open the app** on your phone
2. **Click "Sessions"** button (bottom left with 📊 icon)
3. **Click "New Session"** (green button at bottom)
4. Recording starts automatically - you'll see the red "Recording" indicator
5. **Row your piece**
6. **Click "Stop"** (red button) when finished
7. Your session is **automatically saved**!

### Recording Multiple Pieces

Each time you start a new session:
- Previous session data is preserved
- New session gets its own entry in the session list
- No need to export between pieces

**Workflow:**
```
Sessions → New Session → Row → Stop → Repeat!
```

### Viewing Your Sessions

Click **Sessions** to see:
- Date and time of each session
- Duration (minutes:seconds)
- Number of strokes
- Average stroke rate (SPM)
- Average drive percentage
- Maximum speed
- Total distance covered

### Exporting Data

When you're ready to analyze on your computer:

1. Click **Sessions**
2. Find the session you want
3. Click **💾 Export** next to that session
4. File downloads as `wrc_coach_[date-time].wrcdata`

You can export:
- Individual sessions
- Multiple sessions (export each separately)
- At any time (even days later - data is saved on your phone)

### Managing Storage

If your phone storage gets full:
- Click **Sessions**
- Delete old sessions you don't need with **🗑️ Delete**
- Or use **Clear All** to delete everything at once

The app will also auto-delete oldest sessions if storage is completely full.

## Tips for First Use

### ✅ DO:
- Start fresh sessions for each piece/outing
- Export important sessions regularly to your computer
- Delete sessions you don't need to save storage

### ⚠️ DON'T WORRY IF:
- Displays don't show perfect data initially - that's expected
- You forget to export immediately - data stays saved
- App closes unexpectedly - current recording is lost, but previous sessions are safe

### 📱 Storage Notes:
- Sessions stored locally on your device
- Survives app restarts and updates
- Not synced to cloud (export to save permanently)
- Each session includes full raw sensor data

## Known Limitations (First Version)

1. **Display accuracy**: Visualizations may need tuning for real boat motion
2. **No session editing**: Can't rename or add notes to sessions yet
3. **Export only**: No in-app detailed session replay yet
4. **Local only**: Must manually backup exports (no cloud sync)

## Troubleshooting

**Session not saving?**
- Check that you have phone storage available
- Make sure you clicked Stop (recording indicator off)

**Can't export?**
- Check Downloads folder permissions
- Try deleting old downloads to free space

**Lost a recording?**
- If app crashed during recording, that session won't be saved
- All previously stopped sessions are safe in Sessions panel

## What to Collect

For best data collection on first outing:

1. **Multiple short pieces** (30s - 2min each)
   - Helps identify if displays work correctly
   - Easier to correlate with what you felt

2. **Vary intensity**
   - Light paddling
   - Steady state
   - Harder pieces
   
3. **Note conditions**
   - Remember water conditions (calm/choppy)
   - Wind direction
   - Any unusual motion

This helps debug display issues later!

## Next Steps After First Use

Once you have data:
1. Export all sessions
2. Analyze on computer using Python tools
3. Report any issues with specific session files
4. We can tune display algorithms based on real data

---

**Questions?** Check SESSION_MANAGEMENT_SUMMARY.md for technical details.

