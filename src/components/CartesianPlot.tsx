import { useEffect, useRef } from 'react';
import './CartesianPlot.css';

interface CartesianPlotProps {
  samples: Array<{
    t: number;
    surgeHP?: number;
    inDrive?: boolean;
  }>;
  historyStrokes: number;
  trailOpacity: number;
  catchTimes?: number[]; // optional refined catch timestamps from analysis (ms)
}

interface StrokeSample {
  t: number;
  surge: number;
  inDrive: boolean;
}

export function CartesianPlot({ samples, historyStrokes, trailOpacity, catchTimes }: CartesianPlotProps) {
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
      drawGrid(ctx, margin, plotWidth, plotHeight, centerY, 0, 0);
      return;
    }

    // Group samples by stroke
    // Prefer provided catchTimes from analysis if available; otherwise infer from inDrive
    const allStrokes = catchTimes && catchTimes.length > 0
      ? groupByStrokes(strokeSamples, catchTimes)
      : groupByStrokes(strokeSamples);

    // Debug: log stroke information
    console.log('Strokes detected:', allStrokes.length, 
      'Current stroke samples:', allStrokes.length > 0 ? allStrokes[allStrokes.length - 1].length : 0);

    if (allStrokes.length === 0) {
      drawGrid(ctx, margin, plotWidth, plotHeight, centerY, 0, 0);
      return;
    }

    // Find max surge for scaling
    const allSurges = strokeSamples.map(s => s.surge);
    const maxSurge = Math.max(...allSurges.map(Math.abs), 1);

    // Separate complete strokes from current stroke
    // The last stroke is the current one (still being built)
    const currentStroke = allStrokes[allStrokes.length - 1];
    const completedStrokes = allStrokes.slice(0, -1);
    
    // Get historical strokes to display (excluding current)
    const numHistoricalStrokes = Math.min(completedStrokes.length, historyStrokes);
    const historicalStrokes = completedStrokes.slice(-numHistoricalStrokes);
    
    // Calculate max duration from completed strokes for consistent scaling
    const completedDurations = completedStrokes.map(s => {
      if (s.length < 2) return 0;
      return s[s.length - 1].t; // Already normalized to start from 0
    });
    const maxDuration = completedDurations.length > 0 
      ? Math.max(...completedDurations, 1000) 
      : 1000; // At least 1 second

    // Draw background grid
    drawGrid(ctx, margin, plotWidth, plotHeight, centerY, maxSurge, maxSurge);

    // Draw historical strokes (completed strokes with fading)
    for (let i = 0; i < historicalStrokes.length; i++) {
      const stroke = historicalStrokes[i];
      
      // Calculate opacity: older strokes fade out more dramatically
      const ageFactor = (i + 1) / (historicalStrokes.length + 1);
      const opacity = (trailOpacity / 100) * ageFactor;
      
      drawStroke(ctx, stroke, margin, plotWidth, plotHeight, centerY, maxSurge, maxDuration, opacity);
    }

    // Draw current stroke (fully opaque, still being built)
    if (currentStroke && currentStroke.length > 0) {
      drawStroke(ctx, currentStroke, margin, plotWidth, plotHeight, centerY, maxSurge, maxDuration, 1.0);
    }

    // Draw ideal pattern overlay
    drawIdealPattern(ctx, margin, plotWidth, plotHeight, centerY, maxSurge, maxDuration);

  }, [samples, historyStrokes, trailOpacity]);

  return (
    <div className="cartesian-plot-container">
      <canvas ref={canvasRef} className="cartesian-canvas" />
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
  maxDecel: number
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

  // Vertical grid lines (stroke cycle phases)
  const numGridLines = 6; // More lines for better stroke cycle visualization
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

  // X-axis labels (stroke cycle phases)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  // Label key stroke cycle points
  ctx.fillText('Catch', startX, endY + 5);
  ctx.fillText('Finish', startX + (plotWidth * (1/3)), endY + 5);
  ctx.fillText('Catch', startX + plotWidth, endY + 5);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Stroke Cycle Time', startX + plotWidth / 2, endY + 25);

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

function groupByStrokes(samples: StrokeSample[], catchTimes?: number[]): StrokeSample[][] {
  if (samples.length < 10) return [];

  const strokes: StrokeSample[][] = [];
  const strokeStartTimes: number[] = [];
  let currentStroke: StrokeSample[] = [];
  let currentStrokeStartTime: number | null = null;
  let lastInDrive = false;
  let catchCount = 0;

  // Helper: find last zero crossing time before index i (linear interpolation)
  const findZeroCrossingBefore = (arr: StrokeSample[], idx: number): number | null => {
    const maxBackSamples = 50; // ~1s at 50Hz
    let jStart = Math.max(1, idx - 1);
    let jEnd = Math.max(1, idx - maxBackSamples);
    for (let j = jStart; j >= jEnd; j--) {
      const sPrev = arr[j - 1];
      const sCurr = arr[j];
      // Look for sign change or exact zero
      if (sPrev.surge === 0) return sPrev.t;
      if (sCurr.surge === 0) return sCurr.t;
      if ((sPrev.surge < 0 && sCurr.surge > 0) || (sPrev.surge > 0 && sCurr.surge < 0)) {
        const dt = sCurr.t - sPrev.t;
        const dv = sCurr.surge - sPrev.surge;
        if (dv === 0 || dt === 0) return sCurr.t;
        const alpha = -sPrev.surge / dv; // fraction between prev and curr
        return sPrev.t + alpha * dt;
      }
    }
    return null;
  };

  if (catchTimes && catchTimes.length > 0) {
    // Segment strokes using provided catchTimes (absolute timestamps)
    // Ensure samples sorted by time
    const sortedSamples = samples.slice().sort((a, b) => a.t - b.t);
    const catchIndices: Array<{ index: number; t0: number }> = [];

    for (const ct of catchTimes) {
      // Find first sample at or after catch time
      let idx = sortedSamples.findIndex(s => s.t >= ct);
      if (idx === -1) continue;
      // Refine t0 to last zero crossing before the catch index
      const t0 = findZeroCrossingBefore(sortedSamples, idx) ?? sortedSamples[idx].t;
      catchIndices.push({ index: idx, t0 });
    }

    console.log(`Using provided catchTimes. catches=${catchTimes.length}, matchedIndices=${catchIndices.length}`);

    // Build strokes between successive catches
    for (let k = 0; k < catchIndices.length; k++) {
      const { index: startIdx, t0 } = catchIndices[k];
      const endIdxExclusive = (k + 1 < catchIndices.length) ? catchIndices[k + 1].index : sortedSamples.length;
      const stroke = sortedSamples.slice(startIdx, endIdxExclusive);
      if (stroke.length > 5) {
        strokes.push(stroke);
        strokeStartTimes.push(t0);
      }
    }
  } else {
    // Infer strokes from inDrive transitions
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      // Detect catch: transition from recovery (false) to drive (true)
      if (!lastInDrive && sample.inDrive) {
        catchCount++;
        console.log(`Catch detected #${catchCount} at t=${sample.t}, currentStroke length: ${currentStroke.length}`);

        // Save previous stroke (if any)
        if (currentStroke.length > 5) {
          strokes.push([...currentStroke]);
          strokeStartTimes.push(currentStrokeStartTime ?? currentStroke[0].t);
        }

        // Compute refined t0: last zero crossing before this catch
        const t0 = findZeroCrossingBefore(samples, i) ?? sample.t;
        currentStroke = [sample];
        currentStrokeStartTime = t0;
      } else {
        // Continue building current stroke
        currentStroke.push(sample);
      }
      
      lastInDrive = sample.inDrive;
    }

    // Add current stroke if it has enough samples
    if (currentStroke.length > 5) {
      strokes.push(currentStroke);
      strokeStartTimes.push(currentStrokeStartTime ?? currentStroke[0].t);
    }
  }
  
  console.log(`Strokes built: ${strokes.length}`);
  console.log(`inDrive values in first 20 samples:`, samples.slice(0, 20).map(s => s.inDrive));
  console.log(`Surge values in first 20 samples:`, samples.slice(0, 20).map(s => s.surge.toFixed(2)));
  console.log(`Max surge: ${Math.max(...samples.map(s => s.surge)).toFixed(2)}, Min surge: ${Math.min(...samples.map(s => s.surge)).toFixed(2)}`);

  // For each stroke, normalize time to start from refined t0 (last zero crossing before catch)
  return strokes.map((stroke, idx) => {
    const startTime = strokeStartTimes[idx] ?? stroke[0].t;
    return stroke.map(sample => ({
      ...sample,
      t: sample.t - startTime
    }));
  });
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
  
  // All strokes should be drawn in the same time window (0 to maxDuration)
  // Each stroke is already normalized to start from 0 at catch
  const timeScale = maxDuration > 0 ? plotWidth / maxDuration : 1;

  // Adjust line width based on opacity (older strokes are thinner)
  const baseLineWidth = 4;
  const lineWidth = baseLineWidth * (0.5 + 0.5 * opacity);

  // Draw complete stroke line
  ctx.strokeStyle = `rgba(59, 130, 246, ${opacity})`; // blue
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  let firstPoint = true;

  for (const sample of stroke) {
    const timeSinceCatch = sample.t; // Already normalized to start from 0
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

  // Fill areas for visual clarity (only for current stroke or very recent ones)
  if (opacity > 0.3) {
    ctx.globalAlpha = opacity * 0.15; // Reduced fill opacity

    // Acceleration (positive, above zero line)
    ctx.fillStyle = 'rgba(59, 130, 246, 1)'; // blue
    ctx.beginPath();
    ctx.moveTo(startX, centerY);
    for (const sample of stroke) {
      const timeSinceCatch = sample.t; // Already normalized to start from 0
      const x = startX + (timeSinceCatch * timeScale);
      const y = centerY - (sample.surge * scale);
      if (sample.surge > 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, centerY);
      }
    }
    // Complete the fill to the end of the plot area
    ctx.lineTo(startX + plotWidth, centerY);
    ctx.closePath();
    ctx.fill();

    // Deceleration (negative, below zero line)
    ctx.fillStyle = 'rgba(168, 85, 247, 1)'; // purple
    ctx.beginPath();
    ctx.moveTo(startX, centerY);
    for (const sample of stroke) {
      const timeSinceCatch = sample.t; // Already normalized to start from 0
      const x = startX + (timeSinceCatch * timeScale);
      const y = centerY - (sample.surge * scale);
      if (sample.surge < 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, centerY);
      }
    }
    // Complete the fill to the end of the plot area
    ctx.lineTo(startX + plotWidth, centerY);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1.0;
  }
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
  
  // Ideal pattern: 1/3 drive, 2/3 recovery
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

  // Add phase markers
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  
  // Drive/Finish transition line
  const finishX = startX + (plotWidth * driveRatio);
  ctx.beginPath();
  ctx.moveTo(finishX, margin.top);
  ctx.lineTo(finishX, margin.top + plotHeight);
  ctx.stroke();
  
  ctx.setLineDash([]);
}