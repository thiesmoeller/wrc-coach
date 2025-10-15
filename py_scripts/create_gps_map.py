#!/usr/bin/env python3
"""
Create interactive GPS map from .wrcdata file
Uses folium for interactive maps with speed coloring
"""

import sys
import numpy as np
from read_wrcdata import WRCDataReader

def create_interactive_map(filepath, output_html='gps_map.html'):
    """Create interactive HTML map with GPS track"""
    
    try:
        import folium
        from folium import plugins
    except ImportError:
        print("❌ Folium not installed. Install with: pip install folium")
        print("\n🔄 Falling back to matplotlib static map...")
        create_matplotlib_map(filepath)
        return
    
    # Read data
    reader = WRCDataReader(filepath)
    header, imu, gps, cal = reader.read_as_numpy()
    
    if len(gps) == 0 or np.all(gps['lat'] == 0):
        print("❌ No GPS data available in file")
        return
    
    # Extract GPS data
    lats = gps['lat']
    lons = gps['lon']
    speeds = gps['speed']
    timestamps = gps['t']
    
    # Calculate center of map
    center_lat = np.mean(lats)
    center_lon = np.mean(lons)
    
    # Create map
    m = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=15,
        tiles='OpenStreetMap'
    )
    
    # Add alternative tile layers
    folium.TileLayer(
        tiles='https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png',
        attr='Stamen Terrain',
        name='Terrain',
        overlay=False,
        control=True
    ).add_to(m)
    folium.TileLayer('CartoDB positron', name='Light').add_to(m)
    folium.TileLayer('CartoDB dark_matter', name='Dark').add_to(m)
    
    # Calculate split times (min/500m) - rowing standard
    # Split = time to row 500m at this speed
    splits = []
    for speed in speeds:
        if speed > 0.1:  # Avoid division by zero
            split_seconds = 500 / speed
            splits.append(split_seconds)
        else:
            splits.append(999)  # Very slow/stopped
    
    splits = np.array(splits)
    
    # Create split time colormap (reversed - lower is better)
    from matplotlib import cm
    from matplotlib.colors import Normalize
    
    # Filter out extreme values for better visualization
    valid_splits = splits[splits < 300]  # Ignore splits > 5 min
    if len(valid_splits) > 0:
        norm = Normalize(vmin=valid_splits.min(), vmax=valid_splits.max())
    else:
        norm = Normalize(vmin=splits.min(), vmax=splits.max())
    
    # Reverse colormap so green = fast (low split), red = slow (high split)
    colormap = cm.get_cmap('RdYlGn_r')
    
    # Add route segments colored by split time
    for i in range(len(lats) - 1):
        split_color = colormap(norm(splits[i]))
        color_hex = '#%02x%02x%02x' % (
            int(split_color[0] * 255),
            int(split_color[1] * 255),
            int(split_color[2] * 255)
        )
        
        # Time for this segment
        t_rel = (timestamps[i] - timestamps[0]) / 1000
        minutes = int(t_rel // 60)
        seconds = int(t_rel % 60)
        
        # Format split time
        split_min = int(splits[i] // 60)
        split_sec = int(splits[i] % 60)
        
        folium.PolyLine(
            locations=[[lats[i], lons[i]], [lats[i+1], lons[i+1]]],
            color=color_hex,
            weight=5,
            opacity=0.8,
            popup=f"<b>Split: {split_min}:{split_sec:02d} /500m</b><br>"
                  f"Speed: {speeds[i]:.2f} m/s ({speeds[i]*3.6:.1f} km/h)<br>"
                  f"Time: {minutes}:{seconds:02d}"
        ).add_to(m)
    
    # Add start marker
    folium.Marker(
        location=[lats[0], lons[0]],
        popup='<b>Start</b>',
        icon=folium.Icon(color='green', icon='play')
    ).add_to(m)
    
    # Add finish marker
    folium.Marker(
        location=[lats[-1], lons[-1]],
        popup='<b>Finish</b>',
        icon=folium.Icon(color='red', icon='stop')
    ).add_to(m)
    
    # Calculate total distance
    def haversine_distance(lat1, lon1, lat2, lon2):
        R = 6371000  # Earth radius in meters
        phi1, phi2 = np.radians(lat1), np.radians(lat2)
        dphi = np.radians(lat2 - lat1)
        dlambda = np.radians(lon2 - lon1)
        a = np.sin(dphi/2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda/2)**2
        return 2 * R * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    
    total_distance = sum([
        haversine_distance(lats[i], lons[i], lats[i+1], lons[i+1])
        for i in range(len(lats)-1)
    ])
    
    # Add statistics overlay
    duration = (timestamps[-1] - timestamps[0]) / 1000
    avg_speed = np.mean(speeds)
    max_speed = np.max(speeds)
    
    # Calculate split times
    avg_split = 500 / avg_speed if avg_speed > 0.1 else 0
    best_split = 500 / max_speed if max_speed > 0.1 else 0
    avg_split_min = int(avg_split // 60)
    avg_split_sec = int(avg_split % 60)
    best_split_min = int(best_split // 60)
    best_split_sec = int(best_split % 60)
    
    stats_html = f"""
    <div style="position: fixed; 
                top: 10px; right: 10px; 
                background-color: white; 
                border: 2px solid grey; 
                border-radius: 5px;
                padding: 10px;
                font-family: Arial;
                z-index: 9999;
                box-shadow: 3px 3px 5px rgba(0,0,0,0.3);">
        <h4 style="margin: 0 0 10px 0;">Session Stats</h4>
        <b>Distance:</b> {total_distance:.0f} m ({total_distance/1000:.2f} km)<br>
        <b>Duration:</b> {int(duration//60)}:{int(duration%60):02d}<br>
        <b>Avg Split:</b> {avg_split_min}:{avg_split_sec:02d} /500m<br>
        <b>Best Split:</b> {best_split_min}:{best_split_sec:02d} /500m<br>
        <b>Avg Speed:</b> {avg_speed:.2f} m/s<br>
        <b>GPS Points:</b> {len(gps)}<br>
        <b>Phone:</b> {header.phone_orientation.title()}<br>
    </div>
    """
    m.get_root().html.add_child(folium.Element(stats_html))
    
    # Add colorbar legend with split times
    # Calculate min/max splits for display
    valid_splits_for_legend = splits[splits < 300]
    if len(valid_splits_for_legend) > 0:
        min_split = valid_splits_for_legend.min()
        max_split = valid_splits_for_legend.max()
    else:
        min_split = splits.min()
        max_split = splits.max()
    
    min_split_min = int(min_split // 60)
    min_split_sec = int(min_split % 60)
    max_split_min = int(max_split // 60)
    max_split_sec = int(max_split % 60)
    
    legend_html = f"""
    <div style="position: fixed; 
                bottom: 50px; left: 10px; 
                background-color: white; 
                border: 2px solid grey; 
                border-radius: 5px;
                padding: 10px;
                z-index: 9999;">
        <p style="margin: 0 0 5px 0;"><b>Split Time (/500m)</b></p>
        <div style="background: linear-gradient(to right, #1a9641, #a6d96a, #fdae61, #d7191c); 
                    width: 200px; height: 20px; border: 1px solid black;"></div>
        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            <span>{min_split_min}:{min_split_sec:02d}</span>
            <span style="font-size: 0.9em;">Faster ← → Slower</span>
            <span>{max_split_min}:{max_split_sec:02d}</span>
        </div>
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend_html))
    
    # Add fullscreen option
    plugins.Fullscreen().add_to(m)
    
    # Add measurement tool
    plugins.MeasureControl(position='topleft', primary_length_unit='meters').add_to(m)
    
    # Add layer control
    folium.LayerControl().add_to(m)
    
    # Save map
    m.save(output_html)
    print(f"✅ Interactive map saved to: {output_html}")
    print(f"   Open in browser to view")
    print(f"\n📊 Route Statistics:")
    print(f"   Distance: {total_distance:.0f} m ({total_distance/1000:.2f} km)")
    print(f"   Duration: {int(duration//60)}:{int(duration%60):02d}")
    print(f"   Avg Split: {avg_split_min}:{avg_split_sec:02d} /500m")
    print(f"   Best Split: {best_split_min}:{best_split_sec:02d} /500m")
    print(f"   GPS Points: {len(gps)}")


def create_matplotlib_map(filepath):
    """Fallback: Create static map with matplotlib"""
    import matplotlib.pyplot as plt
    from matplotlib.cm import get_cmap
    from matplotlib.colors import Normalize
    
    reader = WRCDataReader(filepath)
    header, imu, gps, cal = reader.read_as_numpy()
    
    if len(gps) == 0 or np.all(gps['lat'] == 0):
        print("❌ No GPS data available")
        return
    
    lats = gps['lat']
    lons = gps['lon']
    speeds = gps['speed']
    
    # Calculate split times
    splits = []
    for speed in speeds:
        if speed > 0.1:
            splits.append(500 / speed)
        else:
            splits.append(999)
    splits = np.array(splits)
    
    # Create figure
    fig, ax = plt.subplots(figsize=(12, 10))
    
    # Plot route colored by split time (reversed colormap)
    cmap = get_cmap('RdYlGn_r')
    valid_splits = splits[splits < 300]
    if len(valid_splits) > 0:
        norm = Normalize(vmin=valid_splits.min(), vmax=valid_splits.max())
    else:
        norm = Normalize(vmin=splits.min(), vmax=splits.max())
    
    for i in range(len(lats)-1):
        ax.plot([lons[i], lons[i+1]], [lats[i], lats[i+1]], 
                color=cmap(norm(splits[i])), linewidth=3, alpha=0.8)
    
    # Add markers
    ax.plot(lons[0], lats[0], 'go', markersize=15, label='Start', zorder=5)
    ax.plot(lons[-1], lats[-1], 'ro', markersize=15, label='Finish', zorder=5)
    
    # Colorbar with split times
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=norm)
    sm.set_array([])
    cbar = plt.colorbar(sm, ax=ax, orientation='vertical', pad=0.02)
    cbar.set_label('Split Time (/500m)', fontsize=12)
    
    # Format colorbar ticks as min:sec
    ticks = cbar.get_ticks()
    tick_labels = [f"{int(t//60)}:{int(t%60):02d}" for t in ticks]
    cbar.set_ticklabels(tick_labels)
    
    # Calculate distance
    def haversine_distance(lat1, lon1, lat2, lon2):
        R = 6371000
        phi1, phi2 = np.radians(lat1), np.radians(lat2)
        dphi = np.radians(lat2 - lat1)
        dlambda = np.radians(lon2 - lon1)
        a = np.sin(dphi/2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda/2)**2
        return 2 * R * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    
    total_distance = sum([
        haversine_distance(lats[i], lons[i], lats[i+1], lons[i+1])
        for i in range(len(lats)-1)
    ])
    
    # Calculate average split
    avg_split = np.mean(valid_splits) if len(valid_splits) > 0 else 0
    avg_split_min = int(avg_split // 60)
    avg_split_sec = int(avg_split % 60)
    
    ax.set_xlabel('Longitude', fontsize=12)
    ax.set_ylabel('Latitude', fontsize=12)
    ax.set_title(f'GPS Route Map\nDistance: {total_distance:.0f} m ({total_distance/1000:.2f} km) | Avg Split: {avg_split_min}:{avg_split_sec:02d} /500m', 
                fontsize=14, fontweight='bold')
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)
    ax.set_aspect('equal')
    
    output_file = filepath.replace('.wrcdata', '_gps_map.png')
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
    print(f"✅ Static GPS map saved: {output_file}")
    
    plt.show()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python create_gps_map.py <file.wrcdata> [output.html]")
        print("\nCreates interactive HTML map with GPS track colored by speed")
        print("\nRequires: pip install folium")
        print("Falls back to matplotlib if folium not available")
        sys.exit(1)
    
    filepath = sys.argv[1]
    output_html = sys.argv[2] if len(sys.argv) > 2 else filepath.replace('.wrcdata', '_gps_map.html')
    
    create_interactive_map(filepath, output_html)

