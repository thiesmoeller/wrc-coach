import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import type { GPSSample } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './GPSMapLeaflet.css';

// Fix for default marker icons in React-Leaflet
// Using CDN links to avoid import issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Props {
  gpsSamples: GPSSample[];
  height?: number;
}

// Component to fit bounds after map loads
const FitBounds: React.FC<{ bounds: L.LatLngBoundsExpression }> = ({ bounds }) => {
  const map = useMap();
  React.useEffect(() => {
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, bounds]);
  return null;
};

// Custom control to fit route bounds
const FitRouteControl: React.FC<{ bounds: L.LatLngBoundsExpression }> = ({ bounds }) => {
  const map = useMap();

  React.useEffect(() => {
    // Create custom control
    const FitControl = L.Control.extend({
      options: {
        position: 'topleft',
      },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        const button = L.DomUtil.create('a', 'leaflet-control-fit-route', container);
        button.innerHTML = '⊡'; // Box icon for "fit to bounds"
        button.href = '#';
        button.title = 'Fit route to view';
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', 'Fit route to view');

        L.DomEvent.on(button, 'click', function (e) {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 0.5 });
        });

        return container;
      },
    });

    const control = new FitControl();
    map.addControl(control);

    // Cleanup
    return () => {
      map.removeControl(control);
    };
  }, [map, bounds]);

  return null;
};

/**
 * GPS Map visualization using React-Leaflet with OpenStreetMap
 */
export const GPSMapPlot: React.FC<Props> = ({ gpsSamples, height = 600 }) => {
  // Filter valid GPS samples
  const validSamples = useMemo(
    () => gpsSamples.filter((s) => s.lat !== 0 && s.lon !== 0),
    [gpsSamples]
  );

  if (validSamples.length === 0) {
    return (
      <div className="gps-map-leaflet" style={{ height }}>
        <div className="no-data">No GPS data available</div>
      </div>
    );
  }

  // Calculate bounds
  const lats = validSamples.map((s) => s.lat);
  const lons = validSamples.map((s) => s.lon);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const lonMax = Math.max(...lons);

  const bounds: L.LatLngBoundsExpression = [
    [latMin, lonMin],
    [latMax, lonMax],
  ];

  const center: L.LatLngExpression = [(latMin + latMax) / 2, (lonMin + lonMax) / 2];

  // Calculate statistics
  let totalDistance = 0;
  for (let i = 1; i < validSamples.length; i++) {
    const prev = validSamples[i - 1];
    const curr = validSamples[i];
    const R = 6371000; // Earth radius in meters
    const dLat = ((curr.lat - prev.lat) * Math.PI) / 180;
    const dLon = ((curr.lon - prev.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((prev.lat * Math.PI) / 180) *
        Math.cos((curr.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalDistance += R * c;
  }

  const avgSpeed =
    validSamples.reduce((sum, s) => sum + s.speed, 0) / validSamples.length;
  const avgSplit500m = avgSpeed > 0 ? 500 / avgSpeed : 0;
  const avgSplitMin = Math.floor(avgSplit500m / 60);
  const avgSplitSec = Math.floor(avgSplit500m % 60);

  // Speed color mapping
  const getSpeedColor = (speed: number) => {
    const minSpeed = 0;
    const maxSpeed = 6; // m/s (competitive rowing speed)
    const normalized = Math.max(0, Math.min(1, (speed - minSpeed) / (maxSpeed - minSpeed)));
    const hue = normalized * 120; // 0 (red) to 120 (green)
    return `hsl(${hue}, 70%, 50%)`;
  };

  // Create line segments with colors
  const lineSegments = useMemo(() => {
    const segments: Array<{
      positions: L.LatLngExpression[];
      color: string;
    }> = [];

    for (let i = 0; i < validSamples.length - 1; i++) {
      const curr = validSamples[i];
      const next = validSamples[i + 1];
      segments.push({
        positions: [
          [curr.lat, curr.lon],
          [next.lat, next.lon],
        ],
        color: getSpeedColor(curr.speed),
      });
    }

    return segments;
  }, [validSamples]);

  // Custom icons for start/finish
  const startIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="12" fill="#00CC00" stroke="white" stroke-width="3"/>
        <text x="15" y="20" font-size="16" font-weight="bold" text-anchor="middle" fill="white">S</text>
      </svg>
    `),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  const finishIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="12" fill="#DD0000" stroke="white" stroke-width="3"/>
        <text x="15" y="20" font-size="16" font-weight="bold" text-anchor="middle" fill="white">F</text>
      </svg>
    `),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  return (
    <div className="gps-map-leaflet" style={{ height }}>
      {/* Stats Panel Overlay */}
      <div className="stats-overlay">
        <div className="stats-title">Session Stats</div>
        <div className="stats-item">
          Distance: <strong>{(totalDistance / 1000).toFixed(2)} km</strong>
        </div>
        <div className="stats-item">
          Avg Split: <strong>{avgSplitMin}:{avgSplitSec.toString().padStart(2, '0')} /500m</strong>
        </div>
        <div className="stats-item">
          GPS Points: <strong>{validSamples.length}</strong>
        </div>
      </div>

      {/* Speed Legend */}
      <div className="speed-legend">
        <div className="legend-label">Speed:</div>
        <div className="legend-gradient"></div>
        <div className="legend-labels">
          <span>Slow</span>
          <span>Fast</span>
        </div>
      </div>

      <MapContainer
        center={center}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <FitBounds bounds={bounds} />
        <FitRouteControl bounds={bounds} />
        
        {/* OpenStreetMap Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* GPS Path - colored line segments */}
        {lineSegments.map((segment, i) => (
          <Polyline
            key={`segment-${i}`}
            positions={segment.positions}
            pathOptions={{
              color: segment.color,
              weight: 4,
              opacity: 0.9,
            }}
          />
        ))}

        {/* Start Marker */}
        <Marker
          position={[validSamples[0].lat, validSamples[0].lon]}
          icon={startIcon}
        >
          <Popup>
            <strong>Start</strong>
            <br />
            {validSamples[0].lat.toFixed(6)}, {validSamples[0].lon.toFixed(6)}
          </Popup>
        </Marker>

        {/* Finish Marker */}
        <Marker
          position={[
            validSamples[validSamples.length - 1].lat,
            validSamples[validSamples.length - 1].lon,
          ]}
          icon={finishIcon}
        >
          <Popup>
            <strong>Finish</strong>
            <br />
            {validSamples[validSamples.length - 1].lat.toFixed(6)},{' '}
            {validSamples[validSamples.length - 1].lon.toFixed(6)}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

