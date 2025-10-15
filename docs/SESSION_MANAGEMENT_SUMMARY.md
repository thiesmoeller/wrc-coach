# Session Management Implementation

## Overview

Replaced the Calibrate button with a Sessions button that opens a session management panel. The app now automatically saves each recording session to localStorage with analysis data, allowing users to review, export, and delete sessions.

## Changes Made

### 1. New Session Storage Hook (`useSessionStorage.ts`)

Created a custom hook to manage session data in localStorage:

- **Features:**
  - Auto-save sessions with unique IDs
  - Persist across app restarts
  - Handle storage quota (removes oldest when full)
  - Delete individual sessions
  - Clear all sessions

- **Session Data Structure:**
  ```typescript
  interface SessionData {
    id: string;
    timestamp: number;
    duration: number;
    samples: any[];
    sessionStartTime: number;
    // Analysis data
    avgStrokeRate: number;
    avgDrivePercent: number;
    maxSpeed: number;
    totalDistance: number;
    strokeCount: number;
    // Settings used during recording
    phoneOrientation?: 'rower' | 'coxswain';
    demoMode?: boolean;
    catchThreshold?: number;
    finishThreshold?: number;
    calibrationData?: any;
  }
  ```

### 2. SessionPanel Component

New panel to manage sessions:

- **UI Features:**
  - Grid layout showing all saved sessions
  - Compact display of session metrics:
    - Date/time
    - Duration
    - Stroke count
    - Average stroke rate (SPM)
    - Average drive percentage
    - Max speed
    - Total distance
  - Export button per session
  - Delete button per session
  - Clear All button (with confirmation)
  - New Session button

- **Mobile Responsive:**
  - Stacks on smaller screens
  - Full-width buttons
  - Touch-friendly sizing

### 3. Updated Control Flow

**Old Flow:**
- Calibrate → Start Session → Stop → Export Data

**New Flow:**
- Sessions → (view saved sessions)
  - New Session → Start recording
  - Stop → Auto-saves to session list
  - Export → Select session to export

### 4. App.tsx Integration

- **Recording Flow:**
  1. Start session: Resets filters and metrics tracking
  2. During recording: Tracks stroke rates, drive percentages, and speeds
  3. Stop session: Calculates session statistics and auto-saves

- **Session Analysis Calculations:**
  - Average Stroke Rate: Mean of all detected stroke rates
  - Average Drive %: Mean of all drive percentages
  - Max Speed: Maximum GPS speed recorded
  - Total Distance: Haversine formula on GPS track
  - Stroke Count: Total number of completed strokes

### 5. ControlPanel Updates

Simplified to 3 buttons:
- **Sessions** - Opens session management panel
- **Start Session** - Begins new recording
- **Stop** - Ends recording and auto-saves

Removed:
- Calibrate button (replaced with Sessions)
- Export Data button (moved to session panel)

## User Workflow

### Recording a Session

1. Click **Sessions** button
2. Click **New Session** 
3. Recording starts automatically
4. Row on the water
5. Click **Stop** when done
6. Session is automatically saved with analysis data

### Exporting Data

1. Click **Sessions** button
2. View list of all recorded sessions
3. Click **Export** on desired session
4. Downloads `.wrcdata` file with session name and timestamp

### Managing Sessions

1. Click **Sessions** button
2. View all sessions with metrics
3. Delete individual sessions with **Delete** button
4. Clear all sessions with **Clear All** button

## Storage

- Sessions stored in localStorage under key: `wrc_coach_sessions`
- Includes full sample data for each session
- Auto-cleanup when storage quota reached (removes oldest)
- Persists across app restarts and updates

## Benefits for First Real-Boat Use

1. **No data loss**: Every recording auto-saves immediately
2. **Multiple sessions**: Can record multiple pieces without losing previous data
3. **Post-analysis**: Review session metrics without re-exporting
4. **Selective export**: Choose which sessions to download
5. **Storage management**: Built-in cleanup for limited device storage

## Next Steps (Optional Enhancements)

- Add session notes/labels
- Session comparison view
- Share sessions between devices
- Cloud backup option
- Session search/filter
- Merge multiple sessions

