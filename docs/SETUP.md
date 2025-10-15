# Quick Setup Guide for WRC Coach

## Fix the Icon Errors

You're seeing these errors because the app icons don't exist yet:
```
GET http://127.0.0.1:3000/icon-192.png 404 (Not Found)
```

### Solution (Choose One):

### Option 1: Use the Icon Generator (Easiest)

1. Open `generate-icons.html` in your browser
2. Click the **Download** buttons for both icons
3. Save them in the same folder as `index.html`:
   - `icon-192.png`
   - `icon-512.png`
4. Refresh your app

### Option 2: Create Simple Placeholder Icons

Create two solid color PNG files (any color):
- `icon-192.png` (192×192 pixels)
- `icon-512.png` (512×512 pixels)

You can use any image editor or online tool like:
- https://placeholder.com/
- Photoshop, GIMP, Paint, etc.

### Option 3: Disable Icons Temporarily

Edit `manifest.json` and remove the icons section:

```json
{
  "name": "Stroke Coach - Rowing Performance Monitor",
  "short_name": "Stroke Coach",
  "description": "Real-time rowing performance feedback",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#1e40af",
  "orientation": "portrait"
}
```

---

## Testing the App

### 1. Start a Local Server

The app requires HTTPS for sensor access. For local testing:

**Using Python:**
```bash
# Python 3
python -m http.server 8000

# Then open: http://localhost:8000
```

**Using Node.js:**
```bash
npx http-server -p 8000
```

**Using PHP:**
```bash
php -S localhost:8000
```

### 2. For HTTPS (Required for Sensors)

Use one of these to get HTTPS:

**Option A: ngrok (Easiest)**
```bash
# Install ngrok from https://ngrok.com
# Start your local server first, then:
ngrok http 8000

# Open the https:// URL on your phone
```

**Option B: Deploy to GitHub Pages (Free)**
1. Push to GitHub
2. Enable Pages in Settings
3. Access via `https://username.github.io/stroke_coach/`

**Option C: Netlify/Vercel (Free, Auto HTTPS)**
- Drag and drop your folder to Netlify
- Or connect your GitHub repo

---

## First Time Setup

1. **Generate Icons** (see above)
2. **Start HTTPS server** (ngrok, GitHub Pages, etc.)
3. **Open on phone** and tap "Add to Home Screen"
4. **Grant permissions:**
   - Motion & Orientation
   - Location (for GPS)
5. **Calibrate** (optional but recommended)
6. **Start rowing!**

---

## Troubleshooting

### "Cannot read properties of undefined"
- **Fixed!** The code now handles missing DOM elements gracefully
- Make sure `index.html`, `styles.css`, and `app.js` are all present
- Clear browser cache and reload

### Sensors Not Working
- **iOS**: Must use Safari (not Chrome)
- **Must be HTTPS** (not http://)
- Grant motion permissions when prompted
- Make sure phone isn't in Low Power Mode

### GPS Not Updating
- Must be outdoors or near windows
- Grant location permission
- Check phone location settings are enabled

### Settings Menu Not Appearing
- Refresh the page
- Check browser console for errors
- Make sure `index.html` has the settings panel HTML

---

## File Checklist

Make sure you have all these files:

- ✅ `index.html` - Main app
- ✅ `styles.css` - Styling
- ✅ `app.js` - Application logic
- ✅ `manifest.json` - PWA config
- ✅ `sw.js` - Service worker
- ✅ `README.md` - Documentation
- ⚠️ `icon-192.png` - App icon (create using generate-icons.html)
- ⚠️ `icon-512.png` - App icon (create using generate-icons.html)
- 📝 `generate-icons.html` - Icon generator tool
- 📝 `SETUP.md` - This file

---

## Quick Test Without Icons

If you just want to test quickly without fixing icons:

1. Comment out the manifest link in `index.html`:
```html
<!-- <link rel="manifest" href="manifest.json"> -->
```

2. Refresh and test

3. Add icons later before deploying

---

## Need Help?

Check the main `README.md` for detailed documentation about:
- How the app works
- Rowing theory
- Technical details
- Deployment options

---

Happy rowing! 🚣‍♀️🚣‍♂️

