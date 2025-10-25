/**
 * Tile Cache Manager
 * Manages OpenStreetMap tile caching for offline/fast viewing
 */

const TILE_CACHE_NAME = 'osm-tiles-v1';
const TILE_CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Get cache statistics
 */
export const getCacheStats = async (): Promise<{
  tileCount: number;
  cacheSize: number;
  oldestTile: number | null;
}> => {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const keys = await cache.keys();
    
    let oldestDate = Date.now();
    let totalSize = 0;
    
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const cachedDate = response.headers.get('sw-cached-date');
        if (cachedDate) {
          const date = parseInt(cachedDate, 10);
          if (date < oldestDate) oldestDate = date;
        }
        
        // Estimate size from blob
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
    
    return {
      tileCount: keys.length,
      cacheSize: totalSize,
      oldestTile: keys.length > 0 ? oldestDate : null,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { tileCount: 0, cacheSize: 0, oldestTile: null };
  }
};

/**
 * Clear all cached tiles
 */
export const clearTileCache = async (): Promise<void> => {
  try {
    await caches.delete(TILE_CACHE_NAME);
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
};

/**
 * Clear expired tiles (older than 30 days)
 */
export const clearExpiredTiles = async (): Promise<number> => {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const keys = await cache.keys();
    
    let deletedCount = 0;
    const now = Date.now();
    
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const cachedDate = response.headers.get('sw-cached-date');
        if (cachedDate) {
          const age = now - parseInt(cachedDate, 10);
          if (age > TILE_CACHE_DURATION) {
            await cache.delete(request);
            deletedCount++;
          }
        }
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Error clearing expired tiles:', error);
    return 0;
  }
};

/**
 * Format bytes to human-readable size
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Format date to readable string
 */
export const formatCacheAge = (timestamp: number): string => {
  const ageMs = Date.now() - timestamp;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  
  return new Date(timestamp).toLocaleDateString();
};

