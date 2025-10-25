import React, { useState, useEffect } from 'react';
import { getCacheStats, clearTileCache, clearExpiredTiles, formatBytes, formatCacheAge } from '../utils/tileCacheManager';
import './CacheInfoPanel.css';

interface Props {
  onClearCache?: () => void;
}

/**
 * Cache Information Panel
 * Shows tile cache statistics and management controls
 */
export const CacheInfoPanel: React.FC<Props> = ({ onClearCache }) => {
  const [stats, setStats] = useState<{
    tileCount: number;
    cacheSize: number;
    oldestTile: number | null;
  } | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const loadStats = async () => {
    const cacheStats = await getCacheStats();
    setStats(cacheStats);
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleClearCache = async () => {
    if (!confirm('Clear all cached map tiles? They will be re-downloaded when needed.')) {
      return;
    }
    
    setIsClearing(true);
    await clearTileCache();
    await loadStats();
    setIsClearing(false);
    
    if (onClearCache) onClearCache();
  };

  const handleClearExpired = async () => {
    setIsClearing(true);
    const deletedCount = await clearExpiredTiles();
    await loadStats();
    setIsClearing(false);
    
    alert(`Cleared ${deletedCount} expired tile(s)`);
  };

  if (!stats) {
    return <div className="cache-info-panel">Loading cache info...</div>;
  }

  return (
    <div className="cache-info-panel">
      <h4>🗺️ Map Tile Cache</h4>
      
      <div className="cache-stats">
        <div className="stat-row">
          <span className="stat-label">Cached Tiles:</span>
          <span className="stat-value">{stats.tileCount}</span>
        </div>
        
        <div className="stat-row">
          <span className="stat-label">Cache Size:</span>
          <span className="stat-value">{formatBytes(stats.cacheSize)}</span>
        </div>
        
        {stats.oldestTile && (
          <div className="stat-row">
            <span className="stat-label">Oldest Tile:</span>
            <span className="stat-value">{formatCacheAge(stats.oldestTile)}</span>
          </div>
        )}
      </div>

      <div className="cache-actions">
        <button
          onClick={handleClearExpired}
          disabled={isClearing || stats.tileCount === 0}
          className="btn-secondary"
        >
          Clear Expired
        </button>
        
        <button
          onClick={handleClearCache}
          disabled={isClearing || stats.tileCount === 0}
          className="btn-danger"
        >
          Clear All Cache
        </button>
      </div>

      <div className="cache-info-text">
        <p>
          Tiles are cached for <strong>30 days</strong> and reused for faster loading.
          Your river locations will load instantly after the first view!
        </p>
      </div>
    </div>
  );
};

