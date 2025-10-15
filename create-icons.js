// Simple script to create placeholder icons
// Run with: node create-icons.js

const fs = require('fs');
const { createCanvas } = require('canvas');

function createIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#1e40af');
    gradient.addColorStop(1, '#3b82f6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Draw rowing-themed elements
    const center = size / 2;
    const radius = size * 0.35;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = size * 0.03;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Outer circle
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner circles
    ctx.lineWidth = size * 0.015;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(center, center, radius * (i / 3), 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // Cross lines
    ctx.beginPath();
    ctx.moveTo(center - radius, center);
    ctx.lineTo(center + radius, center);
    ctx.moveTo(center, center - radius);
    ctx.lineTo(center, center + radius);
    ctx.stroke();
    
    // Stylized stroke curve
    ctx.lineWidth = size * 0.04;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    
    for (let angle = 0; angle <= 144; angle += 5) {
        const rad = (angle - 90) * Math.PI / 180;
        const r = radius * (0.4 + 0.5 * Math.sin((angle / 144) * Math.PI));
        const x = center + Math.cos(rad) * r;
        const y = center + Math.sin(rad) * r;
        
        if (angle === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    for (let angle = 144; angle <= 360; angle += 5) {
        const rad = (angle - 90) * Math.PI / 180;
        const recoveryPhase = (angle - 144) / 216;
        const r = radius * (0.6 - 0.3 * Math.sin(recoveryPhase * Math.PI));
        const x = center + Math.cos(rad) * r;
        const y = center + Math.sin(rad) * r;
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Catch marker
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const catchX = center;
    const catchY = center - radius * 0.5;
    ctx.beginPath();
    ctx.arc(catchX, catchY, size * 0.025, 0, Math.PI * 2);
    ctx.fill();
    
    return canvas;
}

try {
    // Create 192x192 icon
    const icon192 = createIcon(192);
    const buffer192 = icon192.toBuffer('image/png');
    fs.writeFileSync('icon-192.png', buffer192);
    console.log('Created icon-192.png');
    
    // Create 512x512 icon
    const icon512 = createIcon(512);
    const buffer512 = icon512.toBuffer('image/png');
    fs.writeFileSync('icon-512.png', buffer512);
    console.log('Created icon-512.png');
    
    console.log('Icons created successfully!');
} catch (error) {
    console.error('Error: Node.js canvas module not installed.');
    console.log('\nPlease use one of these alternatives:');
    console.log('1. Open generate-icons.html in your browser and download the icons');
    console.log('2. Install canvas: npm install canvas');
    console.log('3. Use any image (192x192 and 512x512) and rename to icon-192.png and icon-512.png');
}

