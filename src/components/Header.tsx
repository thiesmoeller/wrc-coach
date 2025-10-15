import './Header.css';

interface HeaderProps {
  isRecording: boolean;
  isDemoMode: boolean;
  onMenuClick: () => void;
}

export function Header({ isRecording, isDemoMode, onMenuClick }: HeaderProps) {
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
      </div>
    </header>
  );
}

