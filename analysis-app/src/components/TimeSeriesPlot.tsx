import React from 'react';
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

/**
 * SVG-based time series plot component
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

  // Calculate data bounds
  const xMin = Math.min(...timeVector);
  const xMax = Math.max(...timeVector);
  const xRange = xMax - xMin || 1;

  // Find y bounds across all series
  const allValues = series.flatMap(s => s.data).filter(v => isFinite(v));
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yRange = yMax - yMin || 1;
  const yPadding = yRange * 0.1;

  // Scale functions
  const scaleX = (x: number) => ((x - xMin) / xRange) * plotWidth;
  const scaleY = (y: number) => plotHeight - ((y - (yMin - yPadding)) / (yRange + 2 * yPadding)) * plotHeight;

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
    const value = yMin - yPadding + (i / (numYTicks - 1)) * (yRange + 2 * yPadding);
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
    <div className="time-series-plot" style={{ height }}>
      <svg width={width} height={height} className="plot-svg">
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

