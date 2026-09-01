#!/usr/bin/env python3
"""
generate_wrcdata.py — synthesise a realistic .wrcdata (V3) session for testing
the offline analysis without a phone on the water.

This is the Python mirror of `src/lib/analysis/SyntheticRower.ts`: it builds the
signal the forward way (boat-frame surge profile + boat set/roll, an arbitrary
phone mounting and boat heading), rotates true specific force + angular rate into
the phone frame, adds gravity and noise, and writes the binary format the app
records. Because accel/gyro come from the same orientation that defines the
ground-truth roll, running the analysis on this file is a genuine end-to-end
test of the AHRS + PCA + stroke pipeline.
"""

import argparse
import struct
import numpy as np

G = 9.81
D2R = np.pi / 180.0


def surge_shape(cyc: np.ndarray, peak: float) -> np.ndarray:
    """Research-based single-stroke surge profile (m/s²) — matches the TS app."""
    k = peak / 3.2
    out = np.zeros_like(cyc)
    m = cyc < 0.05
    out[m] = -0.5 * k * np.sin((cyc[m] / 0.05) * np.pi)
    m = (cyc >= 0.05) & (cyc < 0.08)
    p = (cyc[m] - 0.05) / 0.03
    out[m] = (-0.5 + 3.5 * p) * k
    m = (cyc >= 0.08) & (cyc < 0.35)
    p = (cyc[m] - 0.08) / 0.27
    seg = np.zeros_like(p)
    a = p < 0.4
    seg[a] = 3.2 * k * np.sin((p[a] * np.pi) / 0.4)
    b = (p >= 0.4) & (p < 0.5)
    seg[b] = (2.8 - (p[b] - 0.4) * 2.0) * k
    c = p >= 0.5
    seg[c] = (2.6 + 0.6 * np.sin(((p[c] - 0.5) * np.pi) / 0.5)) * k
    out[m] = seg
    m = (cyc >= 0.35) & (cyc < 0.40)
    p = (cyc[m] - 0.35) / 0.05
    out[m] = (2.6 * (1 - p) - 0.3 * p) * k
    m = (cyc >= 0.40) & (cyc < 0.75)
    p = (cyc[m] - 0.40) / 0.35
    out[m] = -0.25 * k * np.sin(p * np.pi)
    m = cyc >= 0.75
    p = (cyc[m] - 0.75) / 0.25
    out[m] = (-0.15 - 0.25 * np.sin(p * np.pi * 0.8)) * k
    return out


def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def generate(
    stroke_rate=24.0,
    duration_s=90.0,
    rate_hz=50.0,
    mount_pitch_deg=18.0,
    mount_roll_deg=-6.0,
    boat_heading_deg=40.0,
    roll_amp_deg=3.0,
    drive_peak=3.2,
    noise=0.05,
    gyro_noise=0.5,
    speed_mps=4.2,
    seed=12345,
):
    rng = np.random.default_rng(seed)
    dt = 1000.0 / rate_hz
    period = 60000.0 / stroke_rate
    n = int(duration_s * 1000.0 / dt)
    t0 = 1_000_000.0
    t = t0 + np.arange(n) * dt
    cyc = ((np.arange(n) * dt) % period) / period

    surge = surge_shape(cyc, drive_peak) + rng.normal(0, noise, n)
    sway = rng.normal(0, noise * 0.6, n)
    heave = rng.normal(0, noise, n)

    roll = roll_amp_deg * D2R * np.sin(2 * np.pi * cyc)
    roll_rate = np.gradient(roll, dt / 1000.0)  # rad/s

    Rbp = rot_y(mount_pitch_deg * D2R) @ rot_x(mount_roll_deg * D2R)
    Rwb_yaw = rot_z(boat_heading_deg * D2R)

    imu = np.zeros((n, 10), dtype=np.float64)  # t, ax..az, gx..gz, then mx,my,mz set NaN
    for i in range(n):
        Rwb = Rwb_yaw @ rot_x(roll[i])
        Rwp = Rwb @ Rbp
        a_boat = np.array([surge[i], sway[i], heave[i]])
        a_world = Rwb @ a_boat
        f_world = a_world + np.array([0, 0, G])
        a_phone = Rwp.T @ f_world
        omega_phone = Rbp.T @ np.array([roll_rate[i], 0.0, 0.0])
        imu[i, 0] = t[i]
        imu[i, 1:4] = a_phone
        imu[i, 4:7] = omega_phone / D2R + rng.normal(0, gyro_noise, 3)

    # GPS at 1 Hz.
    n_gps = int(duration_s)
    lat0, lon0 = 53.5, 10.0
    heading = boat_heading_deg * D2R
    gps = np.zeros((n_gps, 6), dtype=np.float64)
    dist = 0.0
    for i in range(n_gps):
        speed = speed_mps + 0.15 * np.sin(2 * np.pi * (i / (period / 1000.0))) + rng.normal(0, 0.05)
        dist += speed
        d_north = dist * np.cos(heading)
        d_east = dist * np.sin(heading)
        lat = lat0 + d_north / 111320.0
        lon = lon0 + d_east / (111320.0 * np.cos(lat0 * D2R))
        gps[i] = [t0 + i * 1000.0, lat, lon, speed, boat_heading_deg, 5.0]

    return imu, gps


def write_wrcdata(path, imu, gps, session_start=1_697_200_000_000.0):
    magic = b"WRC_COACH_V3" + b"\x00" * 4
    with open(path, "wb") as f:
        f.write(magic)  # 16
        f.write(struct.pack("<II", len(imu), len(gps)))  # imu, gps count
        f.write(struct.pack("<I", 0))  # calibration_count
        f.write(struct.pack("<B", 0))  # has_calibration
        f.write(struct.pack("<d", session_start))
        f.write(struct.pack("<B", 0))  # phone_orientation = rower
        f.write(struct.pack("<B", 0))  # demo_mode
        f.write(struct.pack("<ff", 0.6, -0.3))  # catch/finish (metadata only now)
        used = 16 + 8 + 4 + 1 + 8 + 2 + 8
        f.write(b"\x00" * (128 - used))  # pad header to 128

        nan = float("nan")
        for row in imu:
            f.write(struct.pack(
                "<dfffffffff",
                row[0], row[1], row[2], row[3], row[4], row[5], row[6],
                nan, nan, nan,
            ))
        for row in gps:
            f.write(struct.pack(
                "<dddfff",
                row[0], row[1], row[2], row[3], row[4], row[5],
            ))


def main():
    ap = argparse.ArgumentParser(description="Generate a synthetic .wrcdata session")
    ap.add_argument("output", help="output .wrcdata path")
    ap.add_argument("--spm", type=float, default=24.0)
    ap.add_argument("--duration", type=float, default=90.0)
    ap.add_argument("--rate", type=float, default=50.0)
    ap.add_argument("--seed", type=int, default=12345)
    args = ap.parse_args()

    imu, gps = generate(stroke_rate=args.spm, duration_s=args.duration, rate_hz=args.rate, seed=args.seed)
    write_wrcdata(args.output, imu, gps)
    print(f"Wrote {args.output}: {len(imu)} IMU + {len(gps)} GPS samples "
          f"({args.duration:.0f}s @ {args.spm:.0f} SPM, {args.rate:.0f} Hz)")


if __name__ == "__main__":
    main()
