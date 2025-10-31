import './Header.css';

interface SensorStatus {
  imu: boolean;
  gyro: boolean;
  mag: boolean;
  gps: boolean;
}

interface HeaderProps {
  isRecording: boolean;
  isDemoMode: boolean;
  sensorStatus: SensorStatus;
  onMenuClick: () => void;
}

export function Header({ isRecording, isDemoMode, sensorStatus, onMenuClick }: HeaderProps) {
  return (
    <header className="header">
      <button 
        className="menu-btn" 
        onClick={onMenuClick}
        aria-label="Settings (Press S)" 
        title="Settings (Press S)"
      >
        <span className="menu-icon"></span>
        <span className="menu-icon"></span>
        <span className="menu-icon"></span>
      </button>
      
      <h1>
        <img src="/wrc-logo.jpg" alt="WRC" className="logo-img" />
        WRC Coach
      </h1>
      
      <div className="status-indicator">
        <span className={`status-dot ${isRecording ? 'active' : ''}`}></span>
        <span>
          {isDemoMode ? 'Demo Mode' : isRecording ? 'Recording' : 'Ready'}
        </span>
        
        {/* Sensor status indicators */}
        <div className="sensor-status">
          <span className={`sensor-indicator ${sensorStatus.imu ? 'active' : 'inactive'}`} title="Accelerometer (IMU)">
            IMU
          </span>
          <span className={`sensor-indicator ${sensorStatus.gyro ? 'active' : 'inactive'}`} title="Gyroscope">
            GYRO
          </span>
          <span className={`sensor-indicator ${sensorStatus.mag ? 'active' : 'inactive'}`} title="Compass/Heading (Device Orientation)">
            MAG
          </span>
          <span className={`sensor-indicator ${sensorStatus.gps ? 'active' : 'inactive'}`} title="GPS">
            GPS
          </span>
        </div>
      </div>
    </header>
  );
}

