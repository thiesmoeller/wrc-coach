import './MetricsBar.css';

interface MetricsBarProps {
  strokeRate: number;
  drivePercent: number;
  splitTime: string;
  distance: number;
  speed: number;
  sampleCount: number;
}

export function MetricsBar({
  strokeRate,
  drivePercent,
  splitTime,
  distance,
  speed,
  sampleCount,
}: MetricsBarProps) {
  const distanceLabel = distance >= 1000
    ? `${(distance / 1000).toFixed(2)}`
    : `${Math.round(distance)}`;
  const distanceUnit = distance >= 1000 ? 'km' : 'm';

  return (
    <div className="metrics-bar">
      <div className="metric-card">
        <div className="metric-label">Stroke Rate</div>
        <div className="metric-value">{strokeRate || '--'}</div>
        <div className="metric-unit">SPM</div>
      </div>
      
      <div className="metric-card">
        <div className="metric-label">Drive %</div>
        <div className="metric-value">{drivePercent || '--'}</div>
        <div className="metric-unit">%</div>
      </div>
      
      <div className="metric-card">
        <div className="metric-label">Split</div>
        <div className="metric-value">{splitTime}</div>
        <div className="metric-unit">/500m</div>
      </div>

      <div className="metric-card">
        <div className="metric-label">Distance</div>
        <div className="metric-value">{distanceLabel}</div>
        <div className="metric-unit">{distanceUnit}</div>
      </div>

      <div className="metric-card">
        <div className="metric-label">Speed</div>
        <div className="metric-value">{speed > 0 ? speed.toFixed(1) : '--'}</div>
        <div className="metric-unit">m/s</div>
      </div>
      
      <div className="metric-card">
        <div className="metric-label">Samples</div>
        <div className="metric-value">{sampleCount}</div>
        <div className="metric-unit">pts</div>
      </div>
    </div>
  );
}
