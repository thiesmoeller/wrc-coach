# Icon Generation Instructions

The app currently uses SVG icons which work well in modern browsers. If you need PNG icons for better compatibility:

## Option 1: Use generate-icons.html (Recommended)
1. Open `generate-icons.html` in your browser
2. Right-click on each icon and save as:
   - `icon-192.png` (192x192)
   - `icon-512.png` (512x512)
3. Place them in the root directory

## Option 2: Use Node.js script
```bash
npm install canvas
node create-icons.js
```

## Option 3: Manual creation
Create two PNG files with the rowing-themed design:
- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)

The SVG icon (`icon.svg`) is already included and works as a fallback.

