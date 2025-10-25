import React, { useState, useEffect } from 'react';
import type { GPSSample } from '../types';
import './GPSMapPlot.css';

interface Props {
  gpsSamples: GPSSample[];
  height?: number;
}

interface TileCoord {
  x: number;
  y: number;
  z: number;
}

interface LoadedTile {
  coord: TileCoord;
  image: HTMLImageElement;
  blobUrl?: string; // Track blob URL for cleanup
}

// Tile cache manager
const TILE_CACHE_NAME = 'osm-tiles-v1';
const TILE_CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

const getTileFromCache = async (url: string): Promise<Blob | null> => {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const response = await cache.match(url);
    
    if (!response) return null;
    
    // Check if tile is still fresh (< 30 days old)
    const cachedDate = response.headers.get('sw-cached-date');
    if (cachedDate) {
      const age = Date.now() - parseInt(cachedDate, 10);
      if (age > TILE_CACHE_DURATION) {
        // Tile is stale, remove it
        await cache.delete(url);
        return null;
      }
    }
    
    return await response.blob();
  } catch (error) {
    console.warn('Cache read error:', error);
    return null;
  }
};

const saveTileToCache = async (url: string, blob: Blob): Promise<void> => {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    
    // Create a response with cache metadata
    const headers = new Headers();
    headers.append('sw-cached-date', Date.now().toString());
    headers.append('Content-Type', blob.type);
    
    const response = new Response(blob, { headers });
    await cache.put(url, response);
  } catch (error) {
    console.warn('Cache write error:', error);
  }
};

// OpenStreetMap tile utilities
const latLonToTile = (lat: number, lon: number, zoom: number): { x: number; y: number } => {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
};

const tileToLatLon = (x: number, y: number, zoom: number): { lat: number; lon: number } => {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lon };
};

/**
 * SVG-based GPS map visualization with OpenStreetMap underlay
 * Shows the boat's path colored by speed on top of actual map tiles
 */
export const GPSMapPlot: React.FC<Props> = ({ gpsSamples, height = 400 }) => {
  const padding = { top: 40, right: 20, bottom: 50, left: 60 };
  const width = 1000;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const [mapTiles, setMapTiles] = useState<LoadedTile[]>([]);
  const [tilesLoading, setTilesLoading] = useState(false);

  if (gpsSamples.length === 0) {
    return (
      <div className="gps-map-plot" style={{ height }}>
        <div className="plot-empty">No GPS data available</div>
      </div>
    );
  }

  // Filter valid GPS data
  const validSamples = gpsSamples.filter(s => s.lat !== 0 && s.lon !== 0);
  if (validSamples.length === 0) {
    return (
      <div className="gps-map-plot" style={{ height }}>
        <div className="plot-empty">No valid GPS coordinates</div>
      </div>
    );
  }

  // Calculate bounds
  const lats = validSamples.map(s => s.lat);
  const lons = validSamples.map(s => s.lon);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const lonMax = Math.max(...lons);

  const latRange = latMax - latMin || 0.001;
  const lonRange = lonMax - lonMin || 0.001;

  // Add padding to bounds
  const latPadding = latRange * 0.1;
  const lonPadding = lonRange * 0.1;

  // Scale functions (flip Y for proper map orientation)
  const scaleX = (lon: number) => ((lon - (lonMin - lonPadding)) / (lonRange + 2 * lonPadding)) * plotWidth;
  const scaleY = (lat: number) => plotHeight - ((lat - (latMin - latPadding)) / (latRange + 2 * latPadding)) * plotHeight;

  // Calculate split times (min/500m) for coloring
  const speeds = validSamples.map(s => s.speed);
  const maxSpeed = Math.max(...speeds.filter(s => s > 0));
  const minSpeed = Math.min(...speeds.filter(s => s > 0));

  // Color scale (green = fast, red = slow)
  const getSpeedColor = (speed: number): string => {
    if (speed <= 0) return '#999';
    const normalized = (speed - minSpeed) / (maxSpeed - minSpeed || 1);
    // HSL: green (120°) to red (0°)
    const hue = normalized * 120;
    return `hsl(${hue}, 70%, 50%)`;
  };

  // Calculate total distance
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dphi = ((lat2 - lat1) * Math.PI) / 180;
    const dlambda = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  let totalDistance = 0;
  for (let i = 0; i < validSamples.length - 1; i++) {
    totalDistance += haversineDistance(
      validSamples[i].lat,
      validSamples[i].lon,
      validSamples[i + 1].lat,
      validSamples[i + 1].lon
    );
  }

  // Calculate average split
  const avgSpeed = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
  const avgSplit = avgSpeed > 0 ? 500 / avgSpeed : 0;
  const avgSplitMin = Math.floor(avgSplit / 60);
  const avgSplitSec = Math.floor(avgSplit % 60);

  // Determine appropriate zoom level
  const latSpan = latRange;
  const lonSpan = lonRange;
  const maxSpan = Math.max(latSpan, lonSpan);
  
  // Zoom level calculation (approximate)
  let zoom = 15;
  if (maxSpan > 0.01) zoom = 14;
  if (maxSpan > 0.02) zoom = 13;
  if (maxSpan > 0.05) zoom = 12;
  if (maxSpan > 0.1) zoom = 11;

  // Load map tiles
  useEffect(() => {
    const loadTiles = async () => {
      setTilesLoading(true);
      const tiles: LoadedTile[] = [];

      // Calculate tile range (swap min/max for proper bounds)
      const minTile = latLonToTile(latMin, lonMin, zoom);
      const maxTile = latLonToTile(latMax, lonMax, zoom);

      const promises: Promise<void>[] = [];

      // Load tiles with caching
      for (let x = Math.min(minTile.x, maxTile.x); x <= Math.max(minTile.x, maxTile.x); x++) {
        for (let y = Math.min(minTile.y, maxTile.y); y <= Math.max(minTile.y, maxTile.y); y++) {
          const tileUrl = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
          
          const promise = new Promise<void>(async (resolve) => {
            try {
              // Check cache first
              const cachedBlob = await getTileFromCache(tileUrl);
              
              if (cachedBlob) {
                // Use cached tile - convert to data URL to avoid blob URL issues
                const reader = new FileReader();
                reader.onloadend = () => {
                  const img = new Image();
                  img.onload = () => {
                    tiles.push({
                      coord: { x, y, z: zoom },
                      image: img,
                    });
                    resolve();
                  };
                  img.onerror = () => {
                    resolve();
                  };
                  img.src = reader.result as string;
                };
                reader.onerror = () => resolve();
                reader.readAsDataURL(cachedBlob);
              } else {
                // Fetch from OSM server
                const response = await fetch(tileUrl, { mode: 'cors' });
                
                if (!response.ok) {
                  resolve();
                  return;
                }
                
                const blob = await response.blob();
                
                // Save to cache for future use
                await saveTileToCache(tileUrl, blob);
                
                // Load image - convert to data URL
                const reader = new FileReader();
                reader.onloadend = () => {
                  const img = new Image();
                  img.onload = () => {
                    tiles.push({
                      coord: { x, y, z: zoom },
                      image: img,
                    });
                    resolve();
                  };
                  img.onerror = () => {
                    resolve();
                  };
                  img.src = reader.result as string;
                };
                reader.onerror = () => resolve();
                reader.readAsDataURL(blob);
              }
            } catch (error) {
              console.warn(`Failed to load tile ${x},${y}:`, error);
              resolve();
            }
          });
          
          promises.push(promise);
        }
      }

      await Promise.all(promises);
      setMapTiles(tiles);
      setTilesLoading(false);
    };

    loadTiles();
  }, [validSamples, zoom, latMin, latMax, lonMin, lonMax]);

  // Convert tile+pixel position to Web Mercator coordinates
  const tilePixelToMercator = (tileX: number, tileY: number, pixelX: number, pixelY: number) => {
    const tileSize = 256;
    const worldSize = tileSize * Math.pow(2, zoom);
    const mercatorX = (tileX * tileSize + pixelX) / worldSize;
    const mercatorY = (tileY * tileSize + pixelY) / worldSize;
    return { mercatorX, mercatorY };
  };

  // Convert lat/lon to Web Mercator
  const latLonToMercator = (lat: number, lon: number) => {
    const n = Math.pow(2, zoom);
    const mercatorX = ((lon + 180) / 360);
    const latRad = (lat * Math.PI) / 180;
    const mercatorY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
    return { mercatorX, mercatorY };
  };

  // Get bounds in Mercator coordinates
  const topLeftMerc = latLonToMercator(latMax, lonMin);
  const bottomRightMerc = latLonToMercator(latMin, lonMax);
  
  const mercWidth = bottomRightMerc.mercatorX - topLeftMerc.mercatorX;
  const mercHeight = bottomRightMerc.mercatorY - topLeftMerc.mercatorY;
  
  // Scale Mercator coordinates to SVG space
  const mercatorToSVG = (mercX: number, mercY: number) => {
    const x = ((mercX - topLeftMerc.mercatorX) / mercWidth) * plotWidth;
    const y = ((mercY - topLeftMerc.mercatorY) / mercHeight) * plotHeight;
    return { x, y };
  };

  // Convert lat/lon directly to SVG coordinates
  const latLonToSVG = (lat: number, lon: number) => {
    const merc = latLonToMercator(lat, lon);
    return mercatorToSVG(merc.mercatorX, merc.mercatorY);
  };

  return (
    <div className="gps-map-plot" style={{ height }}>
      {/* OSM Attribution */}
      <div className="osm-attribution">
        Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors
      </div>
      
      <svg width={width} height={height} className="plot-svg">
        {/* Title */}
        <text x={width / 2} y={20} textAnchor="middle" className="plot-title">
          GPS Route Map
        </text>

        {/* Plot area */}
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Clip path for map area */}
          <defs>
            <clipPath id="mapClip">
              <rect x={0} y={0} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>

          {/* Background */}
          <rect
            x={0}
            y={0}
            width={plotWidth}
            height={plotHeight}
            fill="#e8f4f8"
            stroke="#ddd"
          />

          {/* OpenStreetMap tiles */}
          <g clipPath="url(#mapClip)">
            {mapTiles.map((tile) => {
              // Get corners in Mercator coordinates
              const topLeft = tilePixelToMercator(tile.coord.x, tile.coord.y, 0, 0);
              const bottomRight = tilePixelToMercator(tile.coord.x, tile.coord.y, 256, 256);
              
              // Convert to SVG coordinates
              const svgTopLeft = mercatorToSVG(topLeft.mercatorX, topLeft.mercatorY);
              const svgBottomRight = mercatorToSVG(bottomRight.mercatorX, bottomRight.mercatorY);
              
              const tileWidth = svgBottomRight.x - svgTopLeft.x;
              const tileHeight = svgBottomRight.y - svgTopLeft.y;

              return (
                <image
                  key={`tile-${tile.coord.x}-${tile.coord.y}`}
                  href={tile.image.src}
                  x={svgTopLeft.x}
                  y={svgTopLeft.y}
                  width={tileWidth}
                  height={tileHeight}
                  opacity={0.7}
                  preserveAspectRatio="none"
                  style={{ imageRendering: 'auto' }}
                />
              );
            })}
          </g>

          {/* Loading indicator */}
          {tilesLoading && mapTiles.length === 0 && (
            <text
              x={plotWidth / 2}
              y={plotHeight / 2}
              textAnchor="middle"
              className="loading-text"
              fill="#666"
            >
              Loading map tiles...
            </text>
          )}

          {/* GPS path colored by speed - drawn on top of map */}
          <g>
            {validSamples.map((sample, i) => {
              if (i === validSamples.length - 1) return null;
              const { x: x1, y: y1 } = latLonToSVG(sample.lat, sample.lon);
              const { x: x2, y: y2 } = latLonToSVG(validSamples[i + 1].lat, validSamples[i + 1].lon);
              const color = getSpeedColor(sample.speed);

              return (
                <line
                  key={`path-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.95}
                />
              );
            })}
          </g>

          {/* Start marker */}
          {(() => {
            const startPos = latLonToSVG(validSamples[0].lat, validSamples[0].lon);
            return (
              <g>
                <circle
                  cx={startPos.x}
                  cy={startPos.y}
                  r={10}
                  fill="#00CC00"
                  stroke="white"
                  strokeWidth={3}
                />
                <text
                  x={startPos.x}
                  y={startPos.y - 18}
                  textAnchor="middle"
                  className="marker-label"
                  fill="white"
                  stroke="black"
                  strokeWidth={0.5}
                >
                  Start
                </text>
              </g>
            );
          })()}

          {/* Finish marker */}
          {(() => {
            const finishPos = latLonToSVG(validSamples[validSamples.length - 1].lat, validSamples[validSamples.length - 1].lon);
            return (
              <g>
                <circle
                  cx={finishPos.x}
                  cy={finishPos.y}
                  r={10}
                  fill="#DD0000"
                  stroke="white"
                  strokeWidth={3}
                />
                <text
                  x={finishPos.x}
                  y={finishPos.y - 18}
                  textAnchor="middle"
                  className="marker-label"
                  fill="white"
                  stroke="black"
                  strokeWidth={0.5}
                >
                  Finish
                </text>
              </g>
            );
          })()}

          {/* Axes */}
          <line x1={0} y1={plotHeight} x2={plotWidth} y2={plotHeight} stroke="#333" strokeWidth={2} />
          <line x1={0} y1={0} x2={0} y2={plotHeight} stroke="#333" strokeWidth={2} />

          {/* Axis labels */}
          <text
            x={plotWidth / 2}
            y={plotHeight + 35}
            textAnchor="middle"
            className="axis-label"
          >
            Longitude
          </text>
          <text
            x={-plotHeight / 2}
            y={-40}
            textAnchor="middle"
            className="axis-label"
            transform={`rotate(-90 ${-plotHeight / 2} -40)`}
          >
            Latitude
          </text>
        </g>

        {/* Stats panel */}
        <g transform={`translate(${width - 180}, 60)`}>
          <rect x={0} y={0} width={160} height={100} fill="white" stroke="#ddd" rx={5} />
          <text x={10} y={20} className="stats-title">Session Stats</text>
          <text x={10} y={40} className="stats-text">
            Distance: {(totalDistance / 1000).toFixed(2)} km
          </text>
          <text x={10} y={60} className="stats-text">
            Avg Split: {avgSplitMin}:{avgSplitSec.toString().padStart(2, '0')} /500m
          </text>
          <text x={10} y={80} className="stats-text">
            GPS Points: {validSamples.length}
          </text>
        </g>

        {/* Color legend */}
        <g transform={`translate(${padding.left}, ${height - 25})`}>
          <text x={0} y={0} className="legend-label">Speed:</text>
          {/* Gradient bar */}
          <defs>
            <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(0, 70%, 50%)" />
              <stop offset="50%" stopColor="hsl(60, 70%, 50%)" />
              <stop offset="100%" stopColor="hsl(120, 70%, 50%)" />
            </linearGradient>
          </defs>
          <rect x={50} y={-12} width={200} height={15} fill="url(#speedGradient)" stroke="#333" />
          <text x={50} y={10} className="legend-label" fontSize={10}>Slow</text>
          <text x={240} y={10} className="legend-label" fontSize={10} textAnchor="end">Fast</text>
        </g>
      </svg>
    </div>
  );
};

