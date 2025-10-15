import { useEffect, useRef } from 'react';
import './PolarPlot.css';

interface PolarPlotProps {
  samples: Array<{
    t: number;
    surgeHP?: number;
    inDrive?: boolean;
  }>;
  historyStrokes: number;
  trailOpacity: number;
}

interface StrokeSample {
  t: number;
  surge: number;
  inDrive: boolean;
}

export function PolarPlot({ samples, historyStrokes, trailOpacity }: PolarPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const margin = { left: 50, right: 20, top: 20, bottom: 40 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const centerY = margin.top + plotHeight / 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get current stroke samples
    const strokeSamples = samples
      .filter(s => s.t !== undefined && s.surgeHP !== undefined)
      .map(s => ({
        t: s.t,
        surge: s.surgeHP!,
        inDrive: s.inDrive || false,
      }));

    if (strokeSamples.length === 0) {
      // Draw empty grid
      drawGrid(ctx, margin, plotWidth, plotHeight, centerY, 0, 0, 0);
      return;
    }

    // Group samples by stroke (detect catch transitions from recovery to drive)
    const strokes = groupByStrokes(strokeSamples);

    if (strokes.length === 0) {
      drawGrid(ctx, margin, plotWidth, plotHeight, centerY, 0, 0, 0);
      return;
    }

    // Find max surge for scaling
    const allSurges = strokeSamples.map(s => s.surge);
    const maxSurge = Math.max(...allSurges.map(Math.abs), 1);

    // Find max stroke duration for x-axis scaling
    const strokeDurations = strokes.map(s => {
      if (s.length < 2) return 0;
      return s[s.length - 1].t - s[0].t;
    });
    const maxDuration = Math.max(...strokeDurations, 1000); // At least 1 second

    // Draw background grid
    drawGrid(ctx, margin, plotWidth, plotHeight, centerY, maxSurge, maxSurge, maxDuration);

    // Draw historical strokes
    const numStrokes = Math.min(strokes.length, historyStrokes + 1);
    for (let i = 0; i < numStrokes - 1; i++) {
      const strokeIndex = strokes.length - numStrokes + i;
      if (strokeIndex >= 0) {
        const opacity = (trailOpacity / 100) * ((i + 1) / numStrokes);
        drawStroke(ctx, strokes[strokeIndex], margin, plotWidth, plotHeight, centerY, maxSurge, maxDuration, opacity);
      }
    }

    // Draw current stroke (most recent)
    if (strokes.length > 0) {
      drawStroke(ctx, strokes[strokes.length - 1], margin, plotWidth, plotHeight, centerY, maxSurge, maxDuration, 1.0);
    }

    // Draw ideal pattern overlay
    drawIdealPattern(ctx, margin, plotWidth, plotHeight, centerY, maxSurge, maxDuration);

  }, [samples, historyStrokes, trailOpacity]);

  return (
    <div className="polar-plot-container">
      <canvas ref={canvasRef} className="polar-canvas" />
      <div className="chart-legend compact">
        <span className="legend-item drive">■ Drive (Acceleration)</span>
        <span className="legend-item recovery">■ Recovery (Deceleration)</span>
        <span className="legend-item ideal">⋯ Ideal Pattern</span>
      </div>
    </div>
  );
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  margin: { left: number; right: number; top: number; bottom: number },
  plotWidth: number,
  plotHeight: number,
  centerY: number,
  maxAccel: number,
  maxDecel: number,
  maxDuration: number
) {
  const startX = margin.left;
  const endX = margin.left + plotWidth;
  const startY = margin.top;
  const endY = margin.top + plotHeight;

  // Grid lines
  ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
  ctx.lineWidth = 1;

  // Horizontal grid lines (acceleration levels)
  for (let i = -2; i <= 2; i++) {
    const y = centerY + (i * plotHeight / 4);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }

  // Vertical grid lines (time intervals)
  const numGridLines = 5;
  for (let i = 0; i <= numGridLines; i++) {
    const x = startX + (i / numGridLines) * plotWidth;
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
  }

  // Zero line (no acceleration)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, centerY);
  ctx.lineTo(endX, centerY);
  ctx.stroke();

  // Axes
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(startX, endY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Labels
  ctx.fillStyle = '#666';
  ctx.font = '11px sans-serif';

  // X-axis labels (time since catch)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const durationSeconds = maxDuration / 1000;
  for (let i = 0; i <= numGridLines; i++) {
    const time = (i / numGridLines) * durationSeconds;
    const x = startX + (i / numGridLines) * plotWidth;
    ctx.fillText(`${time.toFixed(1)}s`, x, endY + 5);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Time Since Catch', startX + plotWidth / 2, endY + 25);

  // Y-axis labels (acceleration)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const maxY = Math.max(maxAccel, maxDecel);
  if (maxY > 0) {
    ctx.fillText(`${maxY.toFixed(1)}`, startX - 5, startY);
    ctx.fillText('0', startX - 5, centerY);
    ctx.fillText(`-${maxY.toFixed(1)}`, startX - 5, endY);
  }

  // Y-axis title
  ctx.save();
  ctx.translate(15, centerY);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Acceleration (m/s²)', 0, 0);
  ctx.restore();
}

function groupByStrokes(samples: StrokeSample[]): StrokeSample[][] {
  const strokes: StrokeSample[][] = [];
  let currentStroke: StrokeSample[] = [];
  let lastInDrive = false;

  for (const sample of samples) {
    // Detect catch: transition from recovery (false) to drive (true)
    if (!lastInDrive && sample.inDrive) {
      // New catch detected - start new stroke
      if (currentStroke.length > 5) {
        strokes.push([...currentStroke]);
      }
      currentStroke = [];
    }
    
    currentStroke.push(sample);
    lastInDrive = sample.inDrive;
  }

  // Add current stroke if it has enough samples
  if (currentStroke.length > 5) {
    strokes.push(currentStroke);
  }

  return strokes;
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeSample[],
  margin: { left: number; right: number; top: number; bottom: number },
  plotWidth: number,
  plotHeight: number,
  centerY: number,
  maxSurge: number,
  maxDuration: number,
  opacity: number
) {
  if (stroke.length === 0) return;

  const scale = maxSurge > 0 ? (plotHeight / 2) / maxSurge : 1;
  const startX = margin.left;
  
  // Normalize time to start from 0 (time since catch)
  const startTime = stroke[0].t;
  const strokeDuration = stroke[stroke.length - 1].t - startTime;
  const timeScale = maxDuration > 0 ? plotWidth / maxDuration : 1;

  // Draw complete stroke line
  ctx.strokeStyle = `rgba(59, 130, 246, ${opacity})`; // blue
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  let firstPoint = true;

  for (const sample of stroke) {
    const timeSinceCatch = sample.t - startTime;
    const x = startX + (timeSinceCatch * timeScale);
    const y = centerY - (sample.surge * scale); // Positive surge goes up

    if (firstPoint) {
      ctx.moveTo(x, y);
      firstPoint = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Fill areas for visual clarity
  ctx.globalAlpha = opacity * 0.2;

  // Acceleration (positive, above zero line)
  ctx.fillStyle = 'rgba(59, 130, 246, 1)'; // blue
  ctx.beginPath();
  ctx.moveTo(startX, centerY);
  for (const sample of stroke) {
    const timeSinceCatch = sample.t - startTime;
    const x = startX + (timeSinceCatch * timeScale);
    const y = centerY - (sample.surge * scale);
    if (sample.surge > 0) {
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, centerY);
    }
  }
  ctx.lineTo(startX + (strokeDuration * timeScale), centerY);
  ctx.closePath();
  ctx.fill();

  // Deceleration (negative, below zero line)
  ctx.fillStyle = 'rgba(168, 85, 247, 1)'; // purple
  ctx.beginPath();
  ctx.moveTo(startX, centerY);
  for (const sample of stroke) {
    const timeSinceCatch = sample.t - startTime;
    const x = startX + (timeSinceCatch * timeScale);
    const y = centerY - (sample.surge * scale);
    if (sample.surge < 0) {
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, centerY);
    }
  }
  ctx.lineTo(startX + (strokeDuration * timeScale), centerY);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1.0;
}

function drawIdealPattern(
  ctx: CanvasRenderingContext2D,
  margin: { left: number; right: number; top: number; bottom: number },
  plotWidth: number,
  plotHeight: number,
  centerY: number,
  maxSurge: number,
  maxDuration: number
) {
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)'; // green
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);

  const startX = margin.left;
  const scale = maxSurge > 0 ? (plotHeight / 2) / maxSurge : 1;
  
  // Simple ideal pattern: 1/3 drive, 2/3 recovery
  const peakAccel = maxSurge * 0.8;      // Strong acceleration during drive
  const peakDecel = maxSurge * 0.3;      // Gentle deceleration during recovery
  const driveRatio = 1/3;                // Drive is 33% of stroke cycle

  ctx.beginPath();

  const steps = 100;
  for (let i = 0; i <= steps; i++) {
    const cyclePos = i / steps;
    const time = cyclePos * maxDuration;
    let surge: number;

    if (cyclePos < driveRatio) {
      // DRIVE PHASE (0-33%): Strong positive acceleration
      // Smooth sine wave for natural acceleration pattern
      const drivePhase = cyclePos / driveRatio;
      surge = peakAccel * Math.sin(drivePhase * Math.PI);
      
    } else {
      // RECOVERY PHASE (33-100%): Gentle negative deceleration
      // Smaller amplitude, smooth return
      const recoveryPhase = (cyclePos - driveRatio) / (1 - driveRatio);
      surge = -peakDecel * Math.sin(recoveryPhase * Math.PI);
    }

    const x = startX + (time / maxDuration) * plotWidth;
    const y = centerY - (surge * scale);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.setLineDash([]); // Reset dash
}

