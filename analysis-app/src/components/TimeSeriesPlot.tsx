import React, { useState, useRef, useCallback } from 'react';
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
}

interface ViewState {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * SVG-based time series plot component with zoom and pan
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
}) => {
  const padding = { top: 40, right: 20, bottom: 50, left: 60 };
  const width = 1000;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (timeVector.length === 0 || series.length === 0) {
    return (
      <div className="time-series-plot" style={{ height }}>
        <div className="plot-empty">No data to display</div>
      </div>
    );
  }

  // Calculate initial data bounds
  const dataXMin = Math.min(...timeVector);
  const dataXMax = Math.max(...timeVector);
  const allValues = series.flatMap(s => s.data).filter(v => isFinite(v));
  const dataYMin = Math.min(...allValues);
  const dataYMax = Math.max(...allValues);
  const dataYRange = dataYMax - dataYMin || 1;
  const dataYPadding = dataYRange * 0.1;

  // Zoom and pan state
  const [viewState, setViewState] = useState<ViewState>({
    xMin: dataXMin,
    xMax: dataXMax,
    yMin: dataYMin - dataYPadding,
    yMax: dataYMax + dataYPadding,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Use view state for bounds
  const xMin = viewState.xMin;
  const xMax = viewState.xMax;
  const xRange = xMax - xMin || 1;
  const yMin = viewState.yMin;
  const yMax = viewState.yMax;
  const yRange = yMax - yMin || 1;

  // Scale functions
  const scaleX = (x: number) => ((x - xMin) / xRange) * plotWidth;
  const scaleY = (y: number) => plotHeight - ((y - yMin) / yRange) * plotHeight;
  
  // Inverse scale functions
  const unscaleX = (sx: number) => (sx / plotWidth) * xRange + xMin;
  const unscaleY = (sy: number) => yMin + (plotHeight - sy) / plotHeight * yRange;

  // Zoom handler (X-axis only)
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Get mouse position relative to plot area
    const mouseX = e.clientX - rect.left - padding.left;
    const mouseY = e.clientY - rect.top - padding.top;

    // Don't zoom if outside plot area
    if (mouseX < 0 || mouseX > plotWidth || mouseY < 0 || mouseY > plotHeight) return;

    // Get data coordinates at mouse position
    const dataX = unscaleX(mouseX);

    // Zoom factor
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

    setViewState(prev => {
      const newXRange = (prev.xMax - prev.xMin) * zoomFactor;

      // Keep mouse position fixed during zoom
      const xRatio = (dataX - prev.xMin) / (prev.xMax - prev.xMin);

      let newXMin = dataX - newXRange * xRatio;
      let newXMax = dataX + newXRange * (1 - xRatio);

      // Constrain to data bounds
      if (newXMin < dataXMin) {
        newXMin = dataXMin;
        newXMax = dataXMin + newXRange;
      }
      if (newXMax > dataXMax) {
        newXMax = dataXMax;
        newXMin = dataXMax - newXRange;
      }

      return {
        xMin: newXMin,
        xMax: newXMax,
        yMin: prev.yMin,  // Keep Y range constant
        yMax: prev.yMax,  // Keep Y range constant
      };
    });
  }, [dataXMin, dataXMax, plotWidth, plotHeight, padding.left, padding.top, unscaleX]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left - padding.left;
    const mouseY = e.clientY - rect.top - padding.top;

    // Only pan if inside plot area
    if (mouseX >= 0 && mouseX <= plotWidth && mouseY >= 0 && mouseY <= plotHeight) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [plotWidth, plotHeight, padding.left, padding.top]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;

    const dataXShift = -(dx / plotWidth) * xRange;

    setViewState(prev => {
      let newXMin = prev.xMin + dataXShift;
      let newXMax = prev.xMax + dataXShift;

      // Constrain to data bounds
      if (newXMin < dataXMin) {
        newXMin = dataXMin;
        newXMax = dataXMin + (prev.xMax - prev.xMin);
      }
      if (newXMax > dataXMax) {
        newXMax = dataXMax;
        newXMin = dataXMax - (prev.xMax - prev.xMin);
      }

      return {
        xMin: newXMin,
        xMax: newXMax,
        yMin: prev.yMin,  // Keep Y range constant
        yMax: prev.yMax,  // Keep Y range constant
      };
    });

    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, dragStart, plotWidth, xRange, dataXMin, dataXMax]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    // Reset to original view
    setViewState({
      xMin: dataXMin,
      xMax: dataXMax,
      yMin: dataYMin - dataYPadding,
      yMax: dataYMax + dataYPadding,
    });
  }, [dataXMin, dataXMax, dataYMin, dataYMax, dataYPadding]);

  // Generate path for a data series
  const generatePath = (data: number[]) => {
    const points = data.map((y, i) => {
      const x = scaleX(timeVector[i]);
      const yScaled = scaleY(y);
      return `${x},${yScaled}`;
    });
    return `M ${points.join(' L ')}`;
  };

  // Grid lines
  const numYTicks = 5;
  const numXTicks = 10;
  const yTicks = Array.from({ length: numYTicks }, (_, i) => {
    const value = yMin + (i / (numYTicks - 1)) * yRange;
    return { value, y: scaleY(value) };
  });
  const xTicks = Array.from({ length: numXTicks }, (_, i) => {
    const value = xMin + (i / (numXTicks - 1)) * xRange;
    return { value, x: scaleX(value) };
  });

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

  return (
    <div className="time-series-plot" style={{ height, position: 'relative' }}>
      {/* Instructions */}
      <div style={{
        position: 'absolute',
        top: '5px',
        right: '10px',
        fontSize: '11px',
        color: '#666',
        background: 'rgba(255,255,255,0.9)',
        padding: '4px 8px',
        borderRadius: '4px',
        pointerEvents: 'none',
        zIndex: 10
      }}>
        🖱️ Drag to pan (X) • Scroll to zoom (X) • Double-click to reset
      </div>
      <svg 
        ref={svgRef}
        width={width} 
        height={height} 
        className="plot-svg"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Title */}
        <text
          x={width / 2}
          y={20}
          textAnchor="middle"
          className="plot-title"
        >
          {title}
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
          />

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
                {tick.value.toFixed(0)}
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

