import { useEffect, useRef } from 'react';
import './StabilityPlot.css';

interface StabilityPlotProps {
  samples: Array<{
    strokeAngle?: number;
    roll?: number;
  }>;
}

interface StabilitySample {
  angle: number;
  roll: number;
}

export function StabilityPlot({ samples }: StabilityPlotProps) {
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
    const centerY = height / 2;
    const margin = 40;
    const plotWidth = width - 2 * margin;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid
    drawGrid(ctx, width, height, margin, centerY);

    // Get samples with both angle and roll
    const stabilitySamples = samples
      .filter(s => s.strokeAngle !== undefined && s.roll !== undefined)
      .map(s => ({
        angle: s.strokeAngle!,
        roll: s.roll!,
      }));

    if (stabilitySamples.length === 0) return;

    // Get most recent complete stroke
    const currentStroke = getCurrentStroke(stabilitySamples);
    
    if (currentStroke.length === 0) return;

    // Draw roll trace
    drawRollTrace(ctx, currentStroke, margin, plotWidth, centerY, height);

  }, [samples]);

  return (
    <div className="stability-plot-container">
      <canvas ref={canvasRef} className="stability-canvas" />
      <div className="chart-legend compact">
        <span className="legend-item port">← Port</span>
        <span className="legend-item starboard">Starboard →</span>
      </div>
    </div>
  );
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, margin: number, centerY: number) {
  const plotWidth = width - 2 * margin;

  // Grid lines
  ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
  ctx.lineWidth = 1;

  // Horizontal grid lines
  for (let i = -2; i <= 2; i++) {
    const y = centerY + (i * height / 6);
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(margin + plotWidth, y);
    ctx.stroke();
  }

  // Vertical grid lines (stroke phases)
  const phases = [0, 0.25, 0.5, 0.75, 1.0];
  phases.forEach(phase => {
    const x = margin + plotWidth * phase;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  });

  // Zero line (perfect stability)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, centerY);
  ctx.lineTo(margin + plotWidth, centerY);
  ctx.stroke();

  // Labels
  ctx.fillStyle = '#666';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';

  // Angle labels
  ctx.textBaseline = 'top';
  ctx.fillText('Catch', margin, height - 12);
  ctx.fillText('Finish', margin + plotWidth * 0.33, height - 12);
  ctx.fillText('Catch', margin + plotWidth, height - 12);

  // Roll labels
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('Port', margin - 5, centerY - 20);
  ctx.fillText('Starboard', margin - 5, centerY + 20);
}

function getCurrentStroke(samples: StabilitySample[]): StabilitySample[] {
  if (samples.length === 0) return [];

  // Find the most recent complete stroke
  // A stroke goes from low angle to high angle back to low
  const strokes: StabilitySample[][] = [];
  let currentStroke: StabilitySample[] = [];
  let lastAngle = 0;

  for (const sample of samples) {
    // Detect stroke boundary (angle wraps from high to low)
    if (lastAngle > 270 && sample.angle < 90) {
      if (currentStroke.length > 10) {
        strokes.push([...currentStroke]);
      }
      currentStroke = [];
    }
    currentStroke.push(sample);
    lastAngle = sample.angle;
  }

  // Return most recent stroke, or current incomplete stroke
  if (strokes.length > 0) {
    return strokes[strokes.length - 1];
  }
  return currentStroke.length > 10 ? currentStroke : [];
}

function drawRollTrace(
  ctx: CanvasRenderingContext2D,
  stroke: StabilitySample[],
  margin: number,
  plotWidth: number,
  centerY: number,
  height: number
) {
  if (stroke.length === 0) return;

  // Sort by angle and add wrap-around point for continuous plot
  const sortedStroke = [...stroke].sort((a, b) => a.angle - b.angle);
  
  // Duplicate catch samples at 360° to close the loop
  const catchSamples = sortedStroke.filter(s => s.angle < 30);
  const wrappedStroke = [
    ...sortedStroke,
    ...catchSamples.map(s => ({ angle: 360, roll: s.roll }))
  ];

  // Find max roll for scaling
  const maxRoll = Math.max(...wrappedStroke.map(s => Math.abs(s.roll)));
  const rollScale = maxRoll > 0 ? (height / 3) / maxRoll : 1;

  // Draw roll line
  ctx.strokeStyle = 'rgba(168, 85, 247, 1)'; // purple
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  let firstPoint = true;

  for (let i = 0; i < wrappedStroke.length; i++) {
    const sample = wrappedStroke[i];
    const x = margin + (sample.angle / 360) * plotWidth;
    const y = centerY - (sample.roll * rollScale); // Negative roll (port) goes up
    
    // Check for discontinuities (angle jumps > 100°)
    if (i > 0) {
      const prevAngle = wrappedStroke[i - 1].angle;
      if (Math.abs(sample.angle - prevAngle) > 100) {
        // Start new path segment
        ctx.stroke();
        ctx.beginPath();
        firstPoint = true;
      }
    }

    if (firstPoint) {
      ctx.moveTo(x, y);
      firstPoint = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Fill areas for visual clarity
  ctx.globalAlpha = 0.2;

  // Port (negative roll, filled upward)
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.moveTo(margin, centerY);
  for (const sample of wrappedStroke) {
    const x = margin + (sample.angle / 360) * plotWidth;
    const y = centerY - (sample.roll * rollScale);
    if (sample.roll < 0) {
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, centerY);
    }
  }
  ctx.lineTo(margin + plotWidth, centerY);
  ctx.closePath();
  ctx.fill();

  // Starboard (positive roll, filled downward)
  ctx.fillStyle = 'green';
  ctx.beginPath();
  ctx.moveTo(margin, centerY);
  for (const sample of wrappedStroke) {
    const x = margin + (sample.angle / 360) * plotWidth;
    const y = centerY - (sample.roll * rollScale);
    if (sample.roll > 0) {
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, centerY);
    }
  }
  ctx.lineTo(margin + plotWidth, centerY);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1.0;
}

