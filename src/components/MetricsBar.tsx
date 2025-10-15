import './MetricsBar.css';

interface MetricsBarProps {
  strokeRate: number;
  drivePercent: number;
  splitTime: string;
  sampleCount: number;
}

export function MetricsBar({ strokeRate, drivePercent, splitTime, sampleCount }: MetricsBarProps) {
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
        <div className="metric-label">Samples</div>
        <div className="metric-value">{sampleCount}</div>
        <div className="metric-unit">pts</div>
      </div>
    </div>
  );
}

