#!/usr/bin/env python3
"""
WRC Coach Data Visualization Tool
Create beautiful visualizations from .wrcdata files
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
from read_wrcdata import WRCDataReader
from scipy import signal
from datetime import datetime, timedelta


class StrokeAnalyzer:
    """Analyze rowing stroke data"""
    
    def __init__(self, imu_data, gps_data, sample_rate=50):
        self.imu = imu_data
        self.gps = gps_data
        self.fs = sample_rate
        
    def detect_strokes(self, acceleration):
        """Detect catch and finish points"""
        # Band-pass filter (0.3-1.2 Hz)
        sos = signal.butter(2, [0.3, 1.2], btype='band', fs=self.fs, output='sos')
        filtered = signal.sosfilt(sos, acceleration)
        
        # Detect peaks (catch) and troughs (finish)
        catches, _ = signal.find_peaks(filtered, height=0.3, distance=self.fs*0.8)
        finishes, _ = signal.find_peaks(-filtered, height=0.1, distance=self.fs*0.8)
        
        return catches, finishes, filtered
    
    def calculate_stroke_metrics(self, catches, finishes):
        """Calculate stroke rate and drive ratio"""
        if len(catches) < 2:
            return None
        
        # Stroke durations
        stroke_times = np.diff(catches) / self.fs
        stroke_rates = 60 / stroke_times  # SPM
        
        # Drive ratios
        drive_ratios = []
        for i in range(min(len(catches), len(finishes))):
            if i < len(finishes) and catches[i] < finishes[i]:
                if i+1 < len(catches):
                    drive_time = (finishes[i] - catches[i]) / self.fs
                    total_time = (catches[i+1] - catches[i]) / self.fs
                    if total_time > 0:
                        drive_ratios.append((drive_time / total_time) * 100)
        
        return {
            'stroke_rate_mean': np.mean(stroke_rates),
            'stroke_rate_std': np.std(stroke_rates),
            'drive_ratio_mean': np.mean(drive_ratios) if drive_ratios else None,
            'drive_ratio_std': np.std(drive_ratios) if drive_ratios else None,
            'stroke_count': len(catches)
        }


def create_comprehensive_plot(filepath):
    """Create comprehensive visualization"""
    
    # Read data
    reader = WRCDataReader(filepath)
    header, imu, gps, cal = reader.read_as_numpy()
    
    # Time vectors
    t_imu = (imu['t'] - imu['t'][0]) / 1000  # seconds
    duration = t_imu[-1] if len(imu) > 0 else 0
    
    # Create figure with more space for GPS map
    fig = plt.figure(figsize=(18, 14))
    gs = GridSpec(5, 2, figure=fig, hspace=0.35, wspace=0.3)
    
    # Title
    session_time = datetime.fromtimestamp(header.session_start / 1000)
    cal_str = ""
    if header.has_calibration and header.calibration:
        c = header.calibration
        cal_str = f' | Calibrated: pitch={c.pitch_offset:.1f}°, roll={c.roll_offset:.1f}°'
    
    fig.suptitle(f'WRC Coach - Session Analysis (V{header.version})\n'
                f'{session_time.strftime("%Y-%m-%d %H:%M:%S")} | '
                f'{header.phone_orientation.title()} | Duration: {duration:.1f}s{cal_str}', 
                fontsize=14, fontweight='bold')
    
    # 1. Acceleration (top left)
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.plot(t_imu, imu['ax'], 'r-', alpha=0.7, linewidth=0.5, label='Lateral (ax)')
    ax1.plot(t_imu, imu['ay'], 'g-', alpha=0.7, linewidth=0.5, label='Fore-aft (ay)')
    ax1.plot(t_imu, imu['az'], 'b-', alpha=0.7, linewidth=0.5, label='Vertical (az)')
    ax1.set_ylabel('Acceleration (m/s²)', fontsize=10)
    ax1.set_xlabel('Time (s)', fontsize=10)
    ax1.legend(fontsize=8, loc='upper right')
    ax1.grid(True, alpha=0.3)
    ax1.set_title('Raw Accelerometer Data', fontsize=11, fontweight='bold')
    
    # 2. Gyroscope (top right)
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.plot(t_imu, imu['gx'], 'r-', alpha=0.7, linewidth=0.5, label='Roll rate (gx)')
    ax2.plot(t_imu, imu['gy'], 'g-', alpha=0.7, linewidth=0.5, label='Pitch rate (gy)')
    ax2.plot(t_imu, imu['gz'], 'b-', alpha=0.7, linewidth=0.5, label='Yaw rate (gz)')
    ax2.set_ylabel('Angular velocity (deg/s)', fontsize=10)
    ax2.set_xlabel('Time (s)', fontsize=10)
    ax2.legend(fontsize=8, loc='upper right')
    ax2.grid(True, alpha=0.3)
    ax2.set_title('Raw Gyroscope Data', fontsize=11, fontweight='bold')
    
    # 3. Stroke detection (middle left)
    ax3 = fig.add_subplot(gs[1, 0])
    analyzer = StrokeAnalyzer(imu, gps)
    catches, finishes, filtered = analyzer.detect_strokes(imu['ay'])
    
    ax3.plot(t_imu, imu['ay'], 'gray', alpha=0.3, linewidth=0.5, label='Raw')
    ax3.plot(t_imu, filtered, 'b-', linewidth=1.5, label='Filtered (0.3-1.2 Hz)')
    ax3.plot(t_imu[catches], filtered[catches], 'go', markersize=8, label='Catch', zorder=5)
    ax3.plot(t_imu[finishes], filtered[finishes], 'ro', markersize=8, label='Finish', zorder=5)
    ax3.axhline(y=header.catch_threshold, color='g', linestyle='--', alpha=0.5, linewidth=1)
    ax3.axhline(y=header.finish_threshold, color='r', linestyle='--', alpha=0.5, linewidth=1)
    ax3.set_ylabel('Fore-aft Accel (m/s²)', fontsize=10)
    ax3.set_xlabel('Time (s)', fontsize=10)
    ax3.legend(fontsize=8, loc='upper right')
    ax3.grid(True, alpha=0.3)
    ax3.set_title(f'Stroke Detection ({len(catches)} strokes detected)', fontsize=11, fontweight='bold')
    
    # 4. Stroke metrics (middle right)
    ax4 = fig.add_subplot(gs[1, 1])
    metrics = analyzer.calculate_stroke_metrics(catches, finishes)
    
    if metrics:
        # Calculate stroke rate over time
        stroke_rates = []
        stroke_times = []
        for i in range(len(catches)-1):
            rate = 60 / ((catches[i+1] - catches[i]) / analyzer.fs)
            stroke_rates.append(rate)
            stroke_times.append(t_imu[catches[i+1]])
        
        ax4.plot(stroke_times, stroke_rates, 'bo-', linewidth=2, markersize=6)
        ax4.axhline(y=metrics['stroke_rate_mean'], color='r', linestyle='--', 
                   linewidth=2, label=f"Mean: {metrics['stroke_rate_mean']:.1f} SPM")
        ax4.fill_between([0, duration], 
                        metrics['stroke_rate_mean'] - metrics['stroke_rate_std'],
                        metrics['stroke_rate_mean'] + metrics['stroke_rate_std'],
                        alpha=0.2, color='red')
        ax4.set_ylabel('Stroke Rate (SPM)', fontsize=10)
        ax4.set_xlabel('Time (s)', fontsize=10)
        ax4.legend(fontsize=8)
        ax4.grid(True, alpha=0.3)
        ax4.set_title('Stroke Rate Over Time', fontsize=11, fontweight='bold')
        ax4.set_ylim([max(0, min(stroke_rates)-2), max(stroke_rates)+2])
    
    # 5. GPS Speed (bottom left)
    ax5 = fig.add_subplot(gs[2, 0])
    if len(gps) > 0:
        t_gps = (gps['t'] - imu['t'][0]) / 1000
        
        # Convert to split times (min/500m)
        splits = []
        for speed in gps['speed']:
            if speed > 0.1:
                split_seconds = 500 / speed
                splits.append(split_seconds)
            else:
                splits.append(np.nan)
        
        ax5.plot(t_gps, splits, 'b-', linewidth=2, marker='o', markersize=4)
        mean_split = np.nanmean(splits)
        ax5.axhline(y=mean_split, color='r', linestyle='--', linewidth=2,
                   label=f'Mean: {int(mean_split//60)}:{int(mean_split%60):02d}')
        ax5.set_ylabel('Split Time (sec/500m)', fontsize=10)
        ax5.set_xlabel('Time (s)', fontsize=10)
        ax5.legend(fontsize=8)
        ax5.grid(True, alpha=0.3)
        ax5.invert_yaxis()  # Lower is better
        ax5.set_title('Boat Speed (Split Times)', fontsize=11, fontweight='bold')
        
        # Format y-axis as MM:SS
        y_ticks = ax5.get_yticks()
        ax5.set_yticklabels([f'{int(y//60)}:{int(y%60):02d}' for y in y_ticks])
    
    # 6. Roll analysis (middle right, second row)
    ax6 = fig.add_subplot(gs[2, 1])
    
    # Calculate roll from accelerometer
    roll = np.arctan2(imu['ax'], np.sqrt(imu['ay']**2 + imu['az']**2)) * 180 / np.pi
    
    ax6.plot(t_imu, roll, 'purple', linewidth=1, alpha=0.7)
    ax6.axhline(y=0, color='k', linestyle='-', linewidth=1)
    ax6.fill_between(t_imu, 0, roll, where=(roll>0), alpha=0.3, color='green', label='Starboard')
    ax6.fill_between(t_imu, 0, roll, where=(roll<0), alpha=0.3, color='red', label='Port')
    ax6.set_ylabel('Roll Angle (degrees)', fontsize=10)
    ax6.set_xlabel('Time (s)', fontsize=10)
    ax6.legend(fontsize=8)
    ax6.grid(True, alpha=0.3)
    ax6.set_title('Boat Roll (Balance)', fontsize=11, fontweight='bold')
    
    # 7. GPS Map (full width on third row)
    ax_map = fig.add_subplot(gs[3, :])
    if len(gps) > 0 and not np.all(gps['lat'] == 0):
        # Extract GPS coordinates
        lats = gps['lat']
        lons = gps['lon']
        speeds = gps['speed']
        
        # Calculate split times (min/500m) - rowing standard
        splits = []
        for speed in speeds:
            if speed > 0.1:
                splits.append(500 / speed)
            else:
                splits.append(999)
        splits = np.array(splits)
        
        # Create split time colormap (reversed - lower is better)
        from matplotlib.cm import get_cmap
        from matplotlib.colors import Normalize
        
        cmap = get_cmap('RdYlGn_r')  # Reversed: green=fast, red=slow
        valid_splits = splits[splits < 300]
        if len(valid_splits) > 0:
            norm = Normalize(vmin=valid_splits.min(), vmax=valid_splits.max())
        else:
            norm = Normalize(vmin=splits.min(), vmax=splits.max())
        
        # Plot route colored by split time
        for i in range(len(lats)-1):
            ax_map.plot([lons[i], lons[i+1]], [lats[i], lats[i+1]], 
                    color=cmap(norm(splits[i])), linewidth=3, alpha=0.8)
        
        # Add start and finish markers
        ax_map.plot(lons[0], lats[0], 'go', markersize=12, label='Start', zorder=5)
        ax_map.plot(lons[-1], lats[-1], 'ro', markersize=12, label='Finish', zorder=5)
        
        # Add colorbar with split times
        sm = plt.cm.ScalarMappable(cmap=cmap, norm=norm)
        sm.set_array([])
        cbar = plt.colorbar(sm, ax=ax_map, orientation='horizontal', pad=0.08, aspect=40)
        cbar.set_label('Split Time (/500m)', fontsize=10)
        
        # Format colorbar ticks as min:sec
        ticks = cbar.get_ticks()
        tick_labels = [f"{int(t//60)}:{int(t%60):02d}" for t in ticks]
        cbar.set_ticklabels(tick_labels)
        
        # Calculate route stats
        # Approximate distance using Haversine formula
        def haversine_distance(lat1, lon1, lat2, lon2):
            R = 6371000  # Earth radius in meters
            phi1, phi2 = np.radians(lat1), np.radians(lat2)
            dphi = np.radians(lat2 - lat1)
            dlambda = np.radians(lon2 - lon1)
            a = np.sin(dphi/2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda/2)**2
            return 2 * R * np.arctan2(np.sqrt(a), np.sqrt(1-a))
        
        total_distance = 0
        for i in range(len(lats)-1):
            total_distance += haversine_distance(lats[i], lons[i], lats[i+1], lons[i+1])
        
        # Calculate average split
        avg_split = np.mean(valid_splits) if len(valid_splits) > 0 else 0
        avg_split_min = int(avg_split // 60)
        avg_split_sec = int(avg_split % 60)
        
        ax_map.set_xlabel('Longitude', fontsize=10)
        ax_map.set_ylabel('Latitude', fontsize=10)
        ax_map.set_title(f'GPS Route Map (Distance: {total_distance:.0f} m, {total_distance/1000:.2f} km | Avg Split: {avg_split_min}:{avg_split_sec:02d} /500m)', 
                     fontsize=11, fontweight='bold')
        ax_map.legend(fontsize=8, loc='upper right')
        ax_map.grid(True, alpha=0.3)
        ax_map.set_aspect('equal', adjustable='datalim')
    else:
        ax_map.text(0.5, 0.5, 'No GPS data available', ha='center', va='center', 
                fontsize=14, transform=ax_map.transAxes)
        ax_map.set_title('GPS Route Map', fontsize=11, fontweight='bold')
        ax_map.axis('off')
    
    # 8. Summary statistics (bottom full width)
    ax8 = fig.add_subplot(gs[4, :])
    ax8.axis('off')
    
    # Create summary text
    summary = []
    summary.append("═" * 120)
    summary.append("SESSION SUMMARY")
    summary.append("═" * 120)
    
    if metrics:
        summary.append(f"Total Strokes: {metrics['stroke_count']}  |  "
                      f"Avg Stroke Rate: {metrics['stroke_rate_mean']:.1f} ± {metrics['stroke_rate_std']:.1f} SPM")
        if metrics['drive_ratio_mean']:
            summary.append(f"Avg Drive Ratio: {metrics['drive_ratio_mean']:.1f} ± {metrics['drive_ratio_std']:.1f}%  |  "
                          f"Target: 33-36% (1:2 ratio)")
    
    if len(gps) > 0 and not np.all(np.isnan(splits)):
        avg_speed = np.nanmean(gps['speed'])
        avg_split = np.nanmean(splits)
        summary.append(f"Avg Boat Speed: {avg_speed:.2f} m/s  |  "
                      f"Avg Split: {int(avg_split//60)}:{int(avg_split%60):02d} /500m")
    
    summary.append(f"Phone Position: {header.phone_orientation.title()}  |  "
                  f"Thresholds: Catch={header.catch_threshold:.1f}, Finish={header.finish_threshold:.1f}")
    summary.append(f"Data Points: {len(imu):,} IMU samples @ ~{len(imu)/duration:.0f} Hz, "
                  f"{len(gps)} GPS samples @ ~{len(gps)/duration:.2f} Hz")
    
    # Add calibration info
    if header.has_calibration and header.calibration:
        c = header.calibration
        summary.append(f"Calibration: Pitch={c.pitch_offset:.2f}°, Roll={c.roll_offset:.2f}°, "
                      f"Gravity={c.gravity_magnitude:.3f} m/s², "
                      f"Samples={c.samples}, Variance={c.variance:.6f}")
        summary.append(f"  Calibration quality: {'Good' if c.variance < 0.01 else 'Fair' if c.variance < 0.05 else 'Poor'} "
                      f"({len(cal)} raw samples collected)")
    else:
        summary.append(f"Calibration: None (V{header.version} format)")
    
    summary_text = '\n'.join(summary)
    ax8.text(0.5, 0.5, summary_text, ha='center', va='center', 
            fontsize=10, family='monospace',
            bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.3))
    
    # Save figure
    output_file = filepath.replace('.wrcdata', '_analysis.png')
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
    print(f"✓ Visualization saved: {output_file}")
    
    plt.show()


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python visualize_wrcdata.py <file.wrcdata>")
        print("\nCreates comprehensive analysis plot from binary data file")
        sys.exit(1)
    
    filepath = sys.argv[1]
    create_comprehensive_plot(filepath)

