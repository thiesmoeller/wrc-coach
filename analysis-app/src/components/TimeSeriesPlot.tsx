import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import './TimeSeriesPlot.css';

interface DataSeries {
  name: string;
  data: number[];
  color: string;
  width?: number;
}

interface MarkerSet {
  name: string;
  positions: number[];
  color: string;
  shape: 'circle' | 'triangle-up' | 'triangle-down';
}

interface Props {
  title: string;
  timeVector: number[];
  series: DataSeries[];
  markers?: MarkerSet[];
  yLabel?: string;
  height?: number;
  showGrid?: boolean;
  // Zoom props
  xRange?: { min: number | null; max: number | null };
  onZoomChange?: (min: number | null, max: number | null) => void;
}

/**
 * SVG-based time series plot component with synchronized x-axis zooming
 * Optimized for desktop/tablet viewing
 */
export const TimeSeriesPlot: React.FC<Props> = ({
  title,
  timeVector,
  series,
  markers = [],
  yLabel = '',
  height = 300,
  showGrid = true,
  xRange,
  onZoomChange,
}) => {
  const padding = { top: 40, right: 20, bottom: 50, left: 60 };
  const width = 1000;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const svgRef = useRef<SVGSVGElement>(null);
  const [isBrushing, setIsBrushing] = useState(false);
  const [brushStart, setBrushStart] = useState<number | null>(null);
  const [brushEnd, setBrushEnd] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<number | null>(null);
  const wheelTimeoutRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<{ min: number; max: number } | null>(null);
  const plotAreaRef = useRef<SVGRectElement | null>(null);

  if (timeVector.length === 0 || series.length === 0) {
    return (
      <div className="time-series-plot" style={{ height }}>
        <div className="plot-empty">No data to display</div>
      </div>
    );
  }

  // Calculate full data bounds
  const fullXMin = Math.min(...timeVector);
  const fullXMax = Math.max(...timeVector);
  const fullXRange = fullXMax - fullXMin || 1;

  // Use zoom range if provided, otherwise use full range
  const xMin = xRange?.min !== null && xRange?.min !== undefined ? xRange.min : fullXMin;
  const xMax = xRange?.max !== null && xRange?.max !== undefined ? xRange.max : fullXMax;
  const xRange_actual = xMax - xMin || 1;

  // Find y bounds across all series (always use full range for y-axis as requested)
  // When zoomed, we still show full amplitude range
  // Filter out NaN/Infinity values before calculating bounds
  const allValues = series.flatMap(s => s.data).filter(v => Number.isFinite(v));
  const yMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const yMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const yRange = yMax - yMin || 1;
  const yPadding = yRange * 0.1;

  // Scale functions
  const scaleX = (x: number) => ((x - xMin) / xRange_actual) * plotWidth;
  const scaleY = (y: number) => plotHeight - ((y - (yMin - yPadding)) / (yRange + 2 * yPadding)) * plotHeight;
  const invScaleX = (px: number) => xMin + (px / plotWidth) * xRange_actual;

  // Set up native wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    if (!onZoomChange || !plotAreaRef.current) return;

    const plotElement = plotAreaRef.current;
    
    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const plotX = e.clientX - rect.left - padding.left;
      if (plotX < 0 || plotX > plotWidth) return;
      
      // Get current zoom state
      const currentMin = xRange?.min ?? fullXMin;
      const currentMax = xRange?.max ?? fullXMax;
      const currentRange = currentMax - currentMin;
      const isAtFullView = !xRange || (xRange.min === null && xRange.max === null) || 
                           (Math.abs(currentRange - fullXRange) / fullXRange < 0.01);
      
      // Zoom factor (scroll up = zoom in, scroll down = zoom out)
      const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const newRange = currentRange * zoomFactor;
      
      // If at full view and trying to zoom out, do nothing
      if (isAtFullView && e.deltaY > 0) {
        return;
      }
      
      // If zooming out beyond full range, reset to full view
      if (newRange >= fullXRange * 0.99) {
        if (wheelTimeoutRef.current) {
          cancelAnimationFrame(wheelTimeoutRef.current);
          wheelTimeoutRef.current = null;
        }
        pendingZoomRef.current = null;
        onZoomChange(null, null);
        return;
      }
      
      // Calculate mouse position in time coordinates
      const invScaleXLocal = (px: number) => currentMin + (px / plotWidth) * currentRange;
      const mouseTime = invScaleXLocal(plotX);
      
      // Calculate new bounds centered on mouse position
      const ratio = (mouseTime - currentMin) / currentRange;
      const newMin = mouseTime - newRange * ratio;
      const newMax = mouseTime + newRange * (1 - ratio);
      
      // Clamp to full range
      let clampedMin = Math.max(fullXMin, newMin);
      let clampedMax = Math.min(fullXMax, newMax);
      
      // If clamped, adjust the other bound to maintain range
      if (clampedMin === fullXMin && newMin < fullXMin) {
        clampedMax = Math.min(fullXMax, clampedMin + newRange);
      }
      if (clampedMax === fullXMax && newMax > fullXMax) {
        clampedMin = Math.max(fullXMin, clampedMax - newRange);
      }
      
      // Only update if we have valid bounds
      if (clampedMin < clampedMax && clampedMin >= fullXMin && clampedMax <= fullXMax) {
        // Store pending zoom
        pendingZoomRef.current = { min: clampedMin, max: clampedMax };
        
        // Cancel any pending animation frame
        if (wheelTimeoutRef.current) {
          cancelAnimationFrame(wheelTimeoutRef.current);
        }
        
        // Schedule update on next animation frame (throttles rapid wheel events)
        wheelTimeoutRef.current = requestAnimationFrame(() => {
          if (pendingZoomRef.current) {
            onZoomChange(pendingZoomRef.current.min, pendingZoomRef.current.max);
            pendingZoomRef.current = null;
          }
          wheelTimeoutRef.current = null;
        });
      }
    };

    plotElement.addEventListener('wheel', handleWheelNative, { passive: false });
    
    return () => {
      plotElement.removeEventListener('wheel', handleWheelNative);
      if (wheelTimeoutRef.current) {
        cancelAnimationFrame(wheelTimeoutRef.current);
      }
    };
  }, [onZoomChange, padding.left, plotWidth, xRange, fullXMin, fullXMax, fullXRange]);

  // Generate path for a data series with decimation for performance
  // Handles NaN gaps by creating separate path segments
  // Decimates data when zoomed out to improve performance
  const generatePath = useMemo(() => {
    // Calculate how many data points are visible in the current zoom range efficiently
    // Find first and last visible indices using binary search approach
    let firstVisible = -1;
    let lastVisible = -1;
    
    for (let i = 0; i < timeVector.length; i++) {
      const t = timeVector[i];
      if (t >= xMin && firstVisible === -1) firstVisible = i;
      if (t <= xMax) lastVisible = i;
    }
    
    const visiblePointCount = firstVisible >= 0 && lastVisible >= firstVisible 
      ? lastVisible - firstVisible + 1 
      : timeVector.length;
    
    // Decimation strategy: target max ~2000 points for smooth rendering
    // When zoomed out, we can skip points without losing visual quality
    const targetPoints = 2000;
    const decimationFactor = visiblePointCount > targetPoints 
      ? Math.ceil(visiblePointCount / targetPoints) 
      : 1;
    
    return (data: number[]) => {
      const segments: string[] = [];
      let currentSegment: { x: number; y: number }[] = [];
      
      // Process data with decimation
      for (let i = 0; i < data.length; i += decimationFactor) {
        const x = timeVector[i];
        const y = data[i];
        
        // Include points that are visible or within a small margin for continuity
        // This ensures sparse data (like GPS) still shows when zoomed in
        // Use both relative (1% of range) and absolute (0.5s) margin for sparse data
        const relativeMargin = xRange_actual * 0.01; // 1% of zoom range
        const absoluteMargin = 0.5; // 0.5 seconds absolute margin
        const margin = Math.max(relativeMargin, absoluteMargin);
        const isVisible = x >= (xMin - margin) && x <= (xMax + margin);
        
        if (!isVisible) {
          // If we have a segment, close it and start new one
          if (currentSegment.length > 0) {
            segments.push(currentSegment.map((p, idx) => 
              idx === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`
            ).join(' '));
            currentSegment = [];
          }
          continue;
        }
        
        // Skip NaN/Infinity values
        if (!Number.isFinite(y)) {
          // If we have a segment, close it and start new one
          if (currentSegment.length > 0) {
            segments.push(currentSegment.map((p, idx) => 
              idx === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`
            ).join(' '));
            currentSegment = [];
          }
          continue;
        }
        
        // Clamp x to visible range for points outside but near the zoom range
        const clampedX = Math.max(xMin, Math.min(xMax, x));
        const plotX = scaleX(clampedX);
        
        // Add valid point to current segment
        currentSegment.push({ x: plotX, y: scaleY(y) });
      }
      
      // Always include the last point if not already included
      if (decimationFactor > 1 && data.length > 0) {
        const lastIdx = data.length - 1;
        const lastX = timeVector[lastIdx];
        const lastY = data[lastIdx];
        const relativeMargin = xRange_actual * 0.01;
        const absoluteMargin = 0.5;
        const margin = Math.max(relativeMargin, absoluteMargin);
        if (lastX >= (xMin - margin) && lastX <= (xMax + margin) && Number.isFinite(lastY)) {
          // Check if last point is already in current segment
          const clampedLastX = Math.max(xMin, Math.min(xMax, lastX));
          const plotLastX = scaleX(clampedLastX);
          if (currentSegment.length === 0 || 
              currentSegment[currentSegment.length - 1].x !== plotLastX) {
            currentSegment.push({ x: plotLastX, y: scaleY(lastY) });
          }
        }
      }
      
      // Add final segment if any
      if (currentSegment.length > 0) {
        segments.push(currentSegment.map((p, idx) => 
          idx === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`
        ).join(' '));
      }
      
      return segments.join(' ');
    };
  }, [timeVector, xMin, xMax, xRange_actual, scaleX, scaleY]);

  // Grid lines
  const numYTicks = 5;
  const numXTicks = 10;
  const yTicks = Array.from({ length: numYTicks }, (_, i) => {
    const value = yMin - yPadding + (i / (numYTicks - 1)) * (yRange + 2 * yPadding);
    return { value, y: scaleY(value) };
  });
  const xTicks = Array.from({ length: numXTicks }, (_, i) => {
    const value = xMin + (i / (numXTicks - 1)) * xRange_actual;
    return { value, x: scaleX(value) };
  });

  // Handle mouse events for brush selection and panning
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    if (!onZoomChange) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const plotX = e.clientX - rect.left - padding.left;
    if (plotX < 0 || plotX > plotWidth) return;
    
    // Check if shift key is pressed for panning, or if already zoomed
    const isZoomed = xRange && (xRange.min !== null || xRange.max !== null);
    const wantsPan = e.shiftKey || (isZoomed && e.button === 1); // Shift+drag or middle mouse button
    
    if (wantsPan && isZoomed) {
      setIsPanning(true);
      setPanStart(plotX);
    } else {
      setIsBrushing(true);
      setBrushStart(plotX);
      setBrushEnd(plotX);
    }
  }, [onZoomChange, padding.left, plotWidth, xRange]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const plotX = e.clientX - rect.left - padding.left;
    
    if (isPanning && panStart !== null && onZoomChange && xRange) {
      // Pan: translate the view
      const deltaX = plotX - panStart;
      const deltaTime = (deltaX / plotWidth) * xRange_actual;
      
      const currentMin = xRange.min ?? fullXMin;
      const currentMax = xRange.max ?? fullXMax;
      const newMin = currentMin - deltaTime;
      const newMax = currentMax - deltaTime;
      
      // Clamp to full range
      const clampedMin = Math.max(fullXMin, Math.min(fullXMax - 0.1, newMin));
      const clampedMax = Math.min(fullXMax, Math.max(fullXMin + 0.1, newMax));
      
      // Only update if within bounds
      if (clampedMin >= fullXMin && clampedMax <= fullXMax) {
        onZoomChange(clampedMin, clampedMax);
        setPanStart(plotX);
      }
    } else if (isBrushing && onZoomChange) {
      if (plotX < 0 || plotX > plotWidth) return;
      setBrushEnd(plotX);
    }
  }, [isBrushing, isPanning, panStart, onZoomChange, plotWidth, padding.left, xRange, xRange_actual, fullXMin, fullXMax]);

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }
    
    if (!isBrushing || !onZoomChange || brushStart === null || brushEnd === null) {
      setIsBrushing(false);
      setBrushStart(null);
      setBrushEnd(null);
      return;
    }

    const startX = Math.min(brushStart, brushEnd);
    const endX = Math.max(brushStart, brushEnd);
    
    // Only zoom if selection is meaningful (at least 5% of plot width)
    if (endX - startX > plotWidth * 0.05) {
      const newMin = invScaleX(startX);
      const newMax = invScaleX(endX);
      onZoomChange(newMin, newMax);
    }
    
    setIsBrushing(false);
    setBrushStart(null);
    setBrushEnd(null);
  }, [isBrushing, isPanning, brushStart, brushEnd, onZoomChange, plotWidth, invScaleX]);

  // Handle double-click to reset zoom
  const handleDoubleClick = useCallback(() => {
    if (onZoomChange) {
      onZoomChange(null, null);
    }
  }, [onZoomChange]);

  // Handle reset button click
  const handleResetClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onZoomChange) {
      onZoomChange(null, null);
    }
  }, [onZoomChange]);

  // Render marker shape
  const renderMarker = (x: number, y: number, shape: string, color: string) => {
    const size = 6;
    switch (shape) {
      case 'circle':
        return <circle cx={x} cy={y} r={size} fill={color} />;
      case 'triangle-up':
        return (
          <polygon
            points={`${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`}
            fill={color}
          />
        );
      case 'triangle-down':
        return (
          <polygon
            points={`${x},${y + size} ${x - size},${y - size} ${x + size},${y - size}`}
            fill={color}
          />
        );
      default:
        return null;
    }
  };

  // Brush selection rectangle
  const brushRect = isBrushing && brushStart !== null && brushEnd !== null ? (
    <rect
      x={Math.min(brushStart, brushEnd)}
      y={0}
      width={Math.abs(brushEnd - brushStart)}
      height={plotHeight}
      fill="rgba(66, 133, 244, 0.2)"
      stroke="rgba(66, 133, 244, 0.8)"
      strokeWidth={1}
      pointerEvents="none"
    />
  ) : null;

  return (
    <div className="time-series-plot" style={{ height }}>
      <svg 
        ref={svgRef}
        width={width} 
        height={height} 
        className="plot-svg"
        onMouseLeave={handleMouseUp}
      >
        {/* Title */}
        <text
          x={width / 2}
          y={20}
          textAnchor="middle"
          className="plot-title"
        >
          {title}
          {xRange && (xRange.min !== null || xRange.max !== null) && (
            <tspan className="zoom-indicator" dx={10} fontSize={11} fill="#888" fontStyle="italic">
              (Zoomed - Double-click to reset)
            </tspan>
          )}
        </text>

        {/* Plot area */}
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Background */}
          <rect
            x={0}
            y={0}
            width={plotWidth}
            height={plotHeight}
            fill="#fafafa"
            stroke="#ddd"
            onDoubleClick={handleDoubleClick}
            style={{ cursor: onZoomChange ? (isPanning ? 'grabbing' : 'crosshair') : 'default' }}
          />

          {/* Brush overlay for zoom selection and panning */}
          {onZoomChange && (
            <rect
              ref={plotAreaRef}
              data-plot-area="true"
              x={0}
              y={0}
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onDoubleClick={handleDoubleClick}
              style={{ cursor: isPanning ? 'grabbing' : (xRange && (xRange.min !== null || xRange.max !== null) ? 'grab' : 'crosshair') }}
            />
          )}

          {/* Brush selection rectangle */}
          {brushRect}

          {/* Grid */}
          {showGrid && (
            <g className="grid">
              {yTicks.map((tick, i) => (
                <line
                  key={`y-grid-${i}`}
                  x1={0}
                  y1={tick.y}
                  x2={plotWidth}
                  y2={tick.y}
                  stroke="#e0e0e0"
                  strokeWidth={1}
                />
              ))}
              {xTicks.map((tick, i) => (
                <line
                  key={`x-grid-${i}`}
                  x1={tick.x}
                  y1={0}
                  x2={tick.x}
                  y2={plotHeight}
                  stroke="#e0e0e0"
                  strokeWidth={1}
                />
              ))}
            </g>
          )}

          {/* Zero line */}
          {yMin < 0 && yMax > 0 && (
            <line
              x1={0}
              y1={scaleY(0)}
              x2={plotWidth}
              y2={scaleY(0)}
              stroke="#999"
              strokeWidth={1.5}
              strokeDasharray="4,2"
            />
          )}

          {/* Data series */}
          {series.map((s, i) => (
            <path
              key={`series-${i}`}
              d={generatePath(s.data)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width || 2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Markers */}
          {markers.map((markerSet, i) => (
            <g key={`markers-${i}`}>
              {markerSet.positions.map((time, j) => {
                if (time < xMin || time > xMax) return null;
                const idx = timeVector.findIndex(t => t >= time);
                if (idx === -1 || idx >= series[0].data.length) return null;
                const x = scaleX(time);
                const y = scaleY(series[0].data[idx]);
                return (
                  <g key={`marker-${i}-${j}`}>
                    {renderMarker(x, y, markerSet.shape, markerSet.color)}
                  </g>
                );
              })}
            </g>
          ))}

          {/* Y-axis */}
          <line x1={0} y1={0} x2={0} y2={plotHeight} stroke="#333" strokeWidth={2} />
          {yTicks.map((tick, i) => (
            <g key={`y-tick-${i}`}>
              <line
                x1={-5}
                y1={tick.y}
                x2={0}
                y2={tick.y}
                stroke="#333"
                strokeWidth={2}
              />
              <text
                x={-10}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="tick-label"
              >
                {tick.value.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Y-axis label */}
          {yLabel && (
            <text
              x={-plotHeight / 2}
              y={-45}
              textAnchor="middle"
              className="axis-label"
              transform={`rotate(-90 ${-plotHeight / 2} -45)`}
            >
              {yLabel}
            </text>
          )}

          {/* X-axis */}
          <line
            x1={0}
            y1={plotHeight}
            x2={plotWidth}
            y2={plotHeight}
            stroke="#333"
            strokeWidth={2}
          />
          {xTicks.map((tick, i) => (
            <g key={`x-tick-${i}`}>
              <line
                x1={tick.x}
                y1={plotHeight}
                x2={tick.x}
                y2={plotHeight + 5}
                stroke="#333"
                strokeWidth={2}
              />
              <text
                x={tick.x}
                y={plotHeight + 20}
                textAnchor="middle"
                className="tick-label"
              >
                {tick.value.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X-axis label */}
          <text
            x={plotWidth / 2}
            y={plotHeight + 40}
            textAnchor="middle"
            className="axis-label"
          >
            Time (s)
          </text>
          
          {/* Zoom instructions */}
          {onZoomChange && (
            <text
              x={plotWidth / 2}
              y={plotHeight + 55}
              textAnchor="middle"
              className="tick-label"
              fontSize={10}
              fill="#666"
            >
              {xRange && (xRange.min !== null || xRange.max !== null) ? (
                <tspan>
                  <tspan fontWeight="bold">Zoomed</tspan> - Scroll to zoom • Shift+drag to pan • Double-click or{' '}
                  <tspan fontWeight="bold" fill="#0066cc" style={{ cursor: 'pointer' }} onClick={handleResetClick}>reset</tspan>
                </tspan>
              ) : (
                <tspan>Scroll to zoom • Drag to select range • Double-click to reset</tspan>
              )}
            </text>
          )}
        </g>

        {/* Legend */}
        {series.length > 1 && (
          <g transform={`translate(${width - 150}, 40)`}>
            {series.map((s, i) => (
              <g key={`legend-${i}`} transform={`translate(0, ${i * 20})`}>
                <line
                  x1={0}
                  y1={0}
                  x2={20}
                  y2={0}
                  stroke={s.color}
                  strokeWidth={s.width || 2}
                />
                <text x={25} y={0} dominantBaseline="middle" className="legend-label">
                  {s.name}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
};
