#!/usr/bin/env python3
"""
rowing_analysis.py — offline rowing analysis & aggregation for .wrcdata sessions.

This is the offline mirror of the app's real-time `RowingPipeline`
(`src/lib/analysis/RowingPipeline.ts`). It runs the SAME processing chain —
sample-rate estimation → Madgwick AHRS gravity removal → PCA-derived boat frame →
band-pass → adaptive zero-crossing stroke detection → INS/GPS speed fusion — so
the numbers you review afterwards match what the athlete saw on the water. The
legacy offline examples filtered raw phone `ay`, which only worked for a
perfectly-mounted phone and ignored gravity and heading entirely.

Being offline, it takes two liberties the real-time path cannot:
  * zero-phase (forward-backward) band-pass filtering, so catch/finish timing is
    unbiased by filter lag;
  * whole-session PCA for the fore–aft axis.

Outputs: a per-stroke CSV, a JSON session summary, and a multi-panel PNG.

Usage:
    python rowing_analysis.py session.wrcdata [--out-dir analysis_out]
"""

import argparse
import json
import math
import os
from dataclasses import dataclass, asdict
from typing import List, Optional

import numpy as np
from scipy.signal import butter, sosfiltfilt

from read_wrcdata import WRCDataReader

G = 9.81
D2R = math.pi / 180.0


# --------------------------------------------------------------------------- #
# Orientation (Madgwick AHRS) — port of src/lib/dsp/MadgwickAHRS.ts
# --------------------------------------------------------------------------- #
def _quat_mul(a, b):
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return np.array([
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ])


def _rotate(q, v):
    """Active rotation of vector v (sensor→earth)."""
    qv = np.array([0.0, v[0], v[1], v[2]])
    qc = np.array([q[0], -q[1], -q[2], -q[3]])
    r = _quat_mul(_quat_mul(q, qv), qc)
    return r[1:]


def _earth_to_sensor(q, v):
    qc = np.array([q[0], -q[1], -q[2], -q[3]])
    return _rotate(qc, v)


class MadgwickAHRS:
    def __init__(self, beta=0.08):
        self.q = np.array([1.0, 0.0, 0.0, 0.0])
        self.beta = beta

    def init_from_accel(self, ax, ay, az):
        n = math.sqrt(ax * ax + ay * ay + az * az)
        if n < 1e-6:
            return
        ax, ay, az = ax / n, ay / n, az / n
        dot = az
        if dot > 0.999999:
            self.q = np.array([1.0, 0, 0, 0])
            return
        if dot < -0.999999:
            self.q = np.array([0.0, 1, 0, 0])
            return
        cx, cy = ay, -ax
        s = math.sqrt((1 + dot) * 2)
        self.q = np.array([s / 2, cx / s, cy / s, 0.0])
        self.q /= np.linalg.norm(self.q)

    def update(self, gx, gy, gz, ax, ay, az, dt):
        q0, q1, q2, q3 = self.q
        qd0 = 0.5 * (-q1 * gx - q2 * gy - q3 * gz)
        qd1 = 0.5 * (q0 * gx + q2 * gz - q3 * gy)
        qd2 = 0.5 * (q0 * gy - q1 * gz + q3 * gx)
        qd3 = 0.5 * (q0 * gz + q1 * gy - q2 * gx)

        anorm = math.sqrt(ax * ax + ay * ay + az * az)
        if anorm > 1e-6:
            ax, ay, az = ax / anorm, ay / anorm, az / anorm
            _2q0, _2q1, _2q2, _2q3 = 2 * q0, 2 * q1, 2 * q2, 2 * q3
            _4q0, _4q1, _4q2 = 4 * q0, 4 * q1, 4 * q2
            _8q1, _8q2 = 8 * q1, 8 * q2
            q0q0, q1q1, q2q2, q3q3 = q0 * q0, q1 * q1, q2 * q2, q3 * q3
            s0 = _4q0 * q2q2 + _2q2 * ax + _4q0 * q1q1 - _2q1 * ay
            s1 = (_4q1 * q3q3 - _2q3 * ax + 4 * q0q0 * q1 - _2q0 * ay - _4q1
                  + _8q1 * q1q1 + _8q1 * q2q2 + _4q1 * az)
            s2 = (4 * q0q0 * q2 + _2q0 * ax + _4q2 * q3q3 - _2q3 * ay - _4q2
                  + _8q2 * q1q1 + _8q2 * q2q2 + _4q2 * az)
            s3 = 4 * q1q1 * q3 - _2q1 * ax + 4 * q2q2 * q3 - _2q2 * ay
            snorm = math.sqrt(s0 * s0 + s1 * s1 + s2 * s2 + s3 * s3)
            if snorm > 1e-9:
                s0, s1, s2, s3 = s0 / snorm, s1 / snorm, s2 / snorm, s3 / snorm
                qd0 -= self.beta * s0
                qd1 -= self.beta * s1
                qd2 -= self.beta * s2
                qd3 -= self.beta * s3

        q = np.array([q0 + qd0 * dt, q1 + qd1 * dt, q2 + qd2 * dt, q3 + qd3 * dt])
        self.q = q / np.linalg.norm(q)
        return self.q

    def gravity_sensor(self):
        return _earth_to_sensor(self.q, np.array([0.0, 0.0, 1.0]))

    def to_earth(self, v):
        return _rotate(self.q, v)


# --------------------------------------------------------------------------- #
# Adaptive stroke detector — port of AdaptiveStrokeDetector.ts
# --------------------------------------------------------------------------- #
@dataclass
class Stroke:
    index: int
    catch_time: float
    finish_time: float
    drive_time: float
    recovery_time: float
    stroke_rate: float
    drive_percent: float
    peak_drive_accel: float
    catch_sharpness: float
    min_recovery_accel: float


def detect_strokes(t_ms: np.ndarray, a: np.ndarray,
                   catch_scale=0.35, finish_scale=0.25, min_level=0.15,
                   min_drive_ms=200, min_period_ms=600, max_period_ms=6000,
                   amp_tau=3.0) -> List[Stroke]:
    strokes: List[Stroke] = []
    phase = "recovery"
    prev_t: Optional[float] = None
    prev_a = 0.0
    ema_sq = 0.0
    last_up = None
    last_down = None
    pending_catch = None
    drive_peak = 0.0
    drive_jerk = 0.0
    recovery_min = 0.0
    last_catch = None
    last_finish = None
    count = 0

    for i in range(len(t_ms)):
        t = float(t_ms[i])
        av = float(a[i])
        dt = 0.02 if prev_t is None else max(1e-3, (t - prev_t) / 1000.0)
        alpha = 1 - math.exp(-dt / amp_tau)
        ema_sq += alpha * (av * av - ema_sq)
        scale = math.sqrt(ema_sq)
        catch_lvl = max(min_level, catch_scale * scale)
        finish_lvl = max(min_level, finish_scale * scale)
        peak_lvl = max(min_level * 1.5, 0.5 * scale)

        if prev_t is not None:
            if prev_a <= 0 and av > 0:
                frac = (0 - prev_a) / (av - prev_a)
                last_up = prev_t + frac * (t - prev_t)
            elif prev_a >= 0 and av < 0:
                frac = (0 - prev_a) / (av - prev_a)
                last_down = prev_t + frac * (t - prev_t)

        if phase == "recovery":
            if av < recovery_min:
                recovery_min = av
            if av > catch_lvl and last_up is not None:
                if last_catch is None or last_up - last_catch >= min_period_ms:
                    phase = "drive"
                    pending_catch = last_up
                    drive_peak = av
                    drive_jerk = 0.0
        else:
            if av > drive_peak:
                drive_peak = av
            if prev_t is not None:
                jerk = (av - prev_a) / dt
                if jerk > drive_jerk:
                    drive_jerk = jerk
            if av < -finish_lvl and last_down is not None and pending_catch is not None:
                catch_time = pending_catch
                finish_time = last_down
                drive_time = finish_time - catch_time
                if drive_time >= min_drive_ms and drive_peak >= peak_lvl:
                    recovery_time = (catch_time - last_finish) if last_finish is not None else 0.0
                    total = drive_time + recovery_time
                    ok = recovery_time == 0 or (min_period_ms <= total <= max_period_ms)
                    if ok:
                        sr = round(60000.0 / total) if (total > 0 and recovery_time > 0) else 0
                        dp = round(100.0 * drive_time / total) if (total > 0 and recovery_time > 0) else 0
                        count += 1
                        strokes.append(Stroke(
                            index=count, catch_time=catch_time, finish_time=finish_time,
                            drive_time=drive_time, recovery_time=recovery_time,
                            stroke_rate=sr, drive_percent=dp, peak_drive_accel=drive_peak,
                            catch_sharpness=drive_jerk, min_recovery_accel=recovery_min,
                        ))
                        last_catch = catch_time
                        last_finish = finish_time
                phase = "recovery"
                pending_catch = None
                recovery_min = 0.0

        prev_t = t
        prev_a = av

    return strokes


# --------------------------------------------------------------------------- #
# Speed / distance fusion — port of SpeedEstimator.ts
# --------------------------------------------------------------------------- #
class SpeedEstimator:
    def __init__(self, q_speed=0.25, q_bias=1e-4, r_gps_base=0.4, gate_sigma=4.0):
        self.q_speed, self.q_bias = q_speed, q_bias
        self.r_gps_base, self.gate = r_gps_base, gate_sigma
        self.v = 0.0
        self.b = 0.0
        self.P = np.array([[1.0, 0.0], [0.0, 1.0]])
        self.distance = 0.0
        self.has_gps = False

    def predict(self, accel, dt):
        if dt <= 0:
            return
        v0 = self.v
        self.v = max(0.0, self.v + (accel - self.b) * dt)
        F = np.array([[1.0, -dt], [0.0, 1.0]])
        Q = np.array([[self.q_speed * dt, 0.0], [0.0, self.q_bias * dt]])
        self.P = F @ self.P @ F.T + Q
        self.distance += 0.5 * (v0 + self.v) * dt

    def update_gps(self, speed, accuracy=5.0):
        if speed < 0 or not math.isfinite(speed):
            return False
        r = self.r_gps_base * (1 + max(0.0, accuracy - 3) / 5.0)
        y = speed - self.v
        s = self.P[0, 0] + r
        if self.has_gps and y * y > self.gate * self.gate * s:
            return False
        self.has_gps = True
        K = np.array([self.P[0, 0] / s, self.P[1, 0] / s])
        self.v = max(0.0, self.v + K[0] * y)
        self.b = self.b + K[1] * y
        self.P = (np.eye(2) - np.outer(K, np.array([1.0, 0.0]))) @ self.P
        return True


# --------------------------------------------------------------------------- #
# Full offline pipeline
# --------------------------------------------------------------------------- #
@dataclass
class SessionSummary:
    duration_s: float
    sample_rate_hz: float
    stroke_count: int
    avg_stroke_rate: float
    stroke_rate_cv: float
    avg_drive_percent: float
    drive_percent_cv: float
    avg_peak_drive_accel: float
    avg_catch_sharpness: float
    avg_check: float
    distance_m: float
    distance_per_stroke: float
    avg_speed: float
    max_speed: float
    best_split_s: float
    roll_rms_deg: float


def _cv(xs):
    xs = np.asarray(xs, dtype=float)
    if xs.size < 2 or xs.mean() == 0:
        return 0.0
    return float(xs.std(ddof=1) / abs(xs.mean()) * 100)


def analyze(imu, gps, band=(0.2, 2.0)):
    t = imu["t"].astype(float)
    n = len(t)
    dt_s = np.diff(t) / 1000.0
    median_dt = float(np.median(dt_s[(dt_s > 1e-3) & (dt_s < 0.5)]))
    fs = 1.0 / median_dt

    ax, ay, az = imu["ax"].astype(float), imu["ay"].astype(float), imu["az"].astype(float)
    gx, gy, gz = imu["gx"].astype(float), imu["gy"].astype(float), imu["gz"].astype(float)

    # --- Orientation + gravity removal (Madgwick AHRS) ---
    # First pass: earth-frame linear acceleration (for the PCA boat-frame fit).
    ahrs = MadgwickAHRS(beta=0.5)
    ahrs.init_from_accel(ax[0], ay[0], az[0])
    grav_mag = G
    roll = np.zeros(n)
    pitch = np.zeros(n)
    lin = np.zeros((n, 3))
    for i in range(n):
        dt = median_dt if i == 0 else max(1e-3, (t[i] - t[i - 1]) / 1000.0)
        if i == 60:
            ahrs.beta = 0.08
        ahrs.update(gx[i] * D2R, gy[i] * D2R, gz[i] * D2R, ax[i], ay[i], az[i], dt)
        e = ahrs.to_earth(np.array([ax[i], ay[i], az[i]]))
        ga = 1 - math.exp(-dt / 5.0)
        grav_mag += ga * (e[2] - grav_mag)
        lin[i] = [e[0], e[1], e[2] - grav_mag]

    # --- Data-driven boat frame via PCA of horizontal linear accel ---
    warm = min(n, int(2 * fs))  # ignore warm-up when fitting the axis
    H = lin[warm:, :2]
    Hc = H - H.mean(axis=0)
    cov = np.cov(Hc.T)
    evals, evecs = np.linalg.eigh(cov)
    forward = evecs[:, np.argmax(evals)]
    forward /= np.linalg.norm(forward)
    proj = Hc @ forward
    if np.mean(proj ** 3) < 0:  # sign via skewness (drive = sharp + spike)
        forward = -forward
    starboard = np.array([forward[1], -forward[0]])

    surge_lin = lin[:, 0] * forward[0] + lin[:, 1] * forward[1]
    sway = lin[:, 0] * starboard[0] + lin[:, 1] * starboard[1]
    heave = lin[:, 2]

    # Second pass: now that the fore–aft axis is known, replay the AHRS to
    # project the reference deck normal onto the boat frame → set (roll) & trim.
    # (Mirrors the real-time pipeline, which does this in one online pass.)
    ahrs2 = MadgwickAHRS(beta=0.5)
    ahrs2.init_from_accel(ax[0], ay[0], az[0])
    deck2 = None
    for i in range(n):
        dt = median_dt if i == 0 else max(1e-3, (t[i] - t[i - 1]) / 1000.0)
        if i == 60:
            ahrs2.beta = 0.08
        ahrs2.update(gx[i] * D2R, gy[i] * D2R, gz[i] * D2R, ax[i], ay[i], az[i], dt)
        if deck2 is None and i >= 30:
            deck2 = ahrs2.gravity_sensor()
        if deck2 is not None:
            up = ahrs2.to_earth(deck2)
            bf = up[0] * forward[0] + up[1] * forward[1]
            bs = up[0] * starboard[0] + up[1] * starboard[1]
            roll[i] = math.atan2(bs, up[2]) / D2R
            pitch[i] = math.atan2(bf, up[2]) / D2R

    # "Set" is deviation from the boat's mean trim, so remove the (arbitrary)
    # reference-normal offset and report roll about the session mean.
    if n > warm:
        roll = roll - float(np.mean(roll[warm:]))
        pitch = pitch - float(np.mean(pitch[warm:]))

    # --- Zero-phase band-pass on surge (offline advantage: no filter lag) ---
    nyq = fs / 2
    lo = min(band[0], nyq * 0.9) / nyq
    hi = min(band[1], nyq * 0.9) / nyq
    sos = butter(2, [lo, hi], btype="band", output="sos")
    surge = sosfiltfilt(sos, surge_lin)

    # --- Adaptive stroke detection ---
    strokes = detect_strokes(t, surge)

    # --- Speed / distance fusion (INS predict + GPS correct) ---
    speed_est = SpeedEstimator()
    speed_series = np.zeros(n)
    gi = 0
    gt = gps["t"].astype(float) if len(gps) else np.array([])
    gspeed = gps["speed"].astype(float) if len(gps) else np.array([])
    gacc = gps["accuracy"].astype(float) if len(gps) else np.array([])
    for i in range(n):
        dt = median_dt if i == 0 else max(1e-3, (t[i] - t[i - 1]) / 1000.0)
        speed_est.predict(float(surge_lin[i]), dt)
        while gi < len(gt) and gt[gi] <= t[i]:
            speed_est.update_gps(float(gspeed[gi]), float(gacc[gi]))
            gi += 1
        speed_series[i] = speed_est.v

    # --- Aggregate ---
    rated = [s for s in strokes if s.stroke_rate > 0]
    rates = np.array([s.stroke_rate for s in rated], dtype=float)
    drives = np.array([s.drive_percent for s in rated], dtype=float)
    peaks = np.array([s.peak_drive_accel for s in strokes], dtype=float)
    sharp = np.array([s.catch_sharpness for s in strokes], dtype=float)
    checks = np.array([s.min_recovery_accel for s in strokes], dtype=float)
    roll_settled = roll[warm:]
    max_speed = float(gspeed.max()) if len(gspeed) else float(speed_series.max())

    summary = SessionSummary(
        duration_s=float((t[-1] - t[0]) / 1000.0),
        sample_rate_hz=round(fs, 2),
        stroke_count=len(strokes),
        avg_stroke_rate=float(rates.mean()) if rates.size else 0.0,
        stroke_rate_cv=_cv(rates),
        avg_drive_percent=float(drives.mean()) if drives.size else 0.0,
        drive_percent_cv=_cv(drives),
        avg_peak_drive_accel=float(peaks.mean()) if peaks.size else 0.0,
        avg_catch_sharpness=float(sharp.mean()) if sharp.size else 0.0,
        avg_check=float(checks.mean()) if checks.size else 0.0,
        distance_m=float(speed_est.distance),
        distance_per_stroke=float(speed_est.distance / len(strokes)) if strokes else 0.0,
        avg_speed=float(speed_series[warm:].mean()),
        max_speed=max_speed,
        best_split_s=float(500.0 / max_speed) if max_speed > 0 else 0.0,
        roll_rms_deg=float(np.sqrt(np.mean(roll_settled ** 2))) if roll_settled.size else 0.0,
    )

    return dict(
        t=t, surge=surge, surge_lin=surge_lin, sway=sway, heave=heave,
        roll=roll, pitch=pitch, speed=speed_series, fs=fs, forward=forward,
        strokes=strokes, summary=summary, gps=gps,
    )


# --------------------------------------------------------------------------- #
# Reporting
# --------------------------------------------------------------------------- #
def split_str(seconds):
    if seconds <= 0:
        return "--"
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


def write_outputs(result, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    summary = result["summary"]
    strokes: List[Stroke] = result["strokes"]

    # JSON summary
    with open(os.path.join(out_dir, "summary.json"), "w") as f:
        json.dump(asdict(summary), f, indent=2)

    # Per-stroke CSV
    with open(os.path.join(out_dir, "strokes.csv"), "w") as f:
        f.write("index,catch_time_ms,finish_time_ms,drive_time_ms,recovery_time_ms,"
                "stroke_rate_spm,drive_percent,peak_drive_accel,catch_sharpness,min_recovery_accel\n")
        for s in strokes:
            f.write(f"{s.index},{s.catch_time:.1f},{s.finish_time:.1f},{s.drive_time:.1f},"
                    f"{s.recovery_time:.1f},{s.stroke_rate},{s.drive_percent},"
                    f"{s.peak_drive_accel:.3f},{s.catch_sharpness:.2f},{s.min_recovery_accel:.3f}\n")

    _plot(result, os.path.join(out_dir, "analysis.png"))


def _plot(result, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    t = result["t"]
    t_s = (t - t[0]) / 1000.0
    strokes: List[Stroke] = result["strokes"]
    summary = result["summary"]

    fig, axes = plt.subplots(2, 2, figsize=(14, 9))
    fig.suptitle(
        f"WRC Coach — offline analysis  |  {summary.stroke_count} strokes @ "
        f"{summary.avg_stroke_rate:.1f} SPM (CV {summary.stroke_rate_cv:.1f}%)  |  "
        f"{summary.distance_m:.0f} m  |  best split {split_str(summary.best_split_s)}/500m",
        fontsize=13,
    )

    # 1) Stroke-cycle overlay (all strokes aligned at the catch).
    ax = axes[0, 0]
    surge = result["surge"]
    for s in strokes[1:]:
        i0 = np.searchsorted(t, s.catch_time)
        i1 = np.searchsorted(t, s.catch_time + (s.drive_time + s.recovery_time))
        if i1 - i0 > 5:
            seg_t = (t[i0:i1] - t[i0]) / 1000.0
            ax.plot(seg_t, surge[i0:i1], color="steelblue", alpha=0.25, lw=1)
    ax.axhline(0, color="k", lw=0.8)
    ax.set_title("Stroke-cycle surge overlay (catch-aligned)")
    ax.set_xlabel("Time since catch (s)")
    ax.set_ylabel("Surge accel (m/s²)")
    ax.grid(alpha=0.3)

    # 2) Stroke rate & drive% over the session.
    ax = axes[0, 1]
    rated = [s for s in strokes if s.stroke_rate > 0]
    xs = [(s.catch_time - t[0]) / 1000.0 for s in rated]
    ax.plot(xs, [s.stroke_rate for s in rated], "o-", color="darkorange", label="Stroke rate (SPM)")
    ax.set_ylabel("Stroke rate (SPM)", color="darkorange")
    ax.set_xlabel("Time (s)")
    ax.grid(alpha=0.3)
    ax2 = ax.twinx()
    ax2.plot(xs, [s.drive_percent for s in rated], "s--", color="seagreen", alpha=0.7, label="Drive %")
    ax2.set_ylabel("Drive %", color="seagreen")
    ax.set_title("Rate & drive ratio consistency")

    # 3) Fused speed & GPS.
    ax = axes[1, 0]
    ax.plot(t_s, result["speed"], color="purple", lw=1.2, label="Fused speed (INS+GPS)")
    gps = result["gps"]
    if len(gps):
        gt = (gps["t"].astype(float) - t[0]) / 1000.0
        ax.plot(gt, gps["speed"].astype(float), "x", color="gray", ms=4, label="Raw GPS")
    ax.set_title("Boat speed")
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Speed (m/s)")
    ax.legend(loc="lower right", fontsize=8)
    ax.grid(alpha=0.3)

    # 4) Boat set (roll) — the last several strokes.
    ax = axes[1, 1]
    ax.plot(t_s, result["roll"], color="crimson", lw=0.8)
    ax.axhline(0, color="k", lw=0.8)
    ax.set_title(f"Boat set (roll) — RMS {summary.roll_rms_deg:.2f}°")
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Roll (deg, +stbd)")
    ax.grid(alpha=0.3)

    fig.tight_layout(rect=[0, 0, 1, 0.96])
    fig.savefig(path, dpi=130)
    plt.close(fig)


def print_summary(summary: SessionSummary):
    print("=" * 66)
    print("WRC Coach — Offline Session Analysis")
    print("=" * 66)
    print(f"  Duration:            {summary.duration_s:6.1f} s   "
          f"(effective {summary.sample_rate_hz:.1f} Hz)")
    print(f"  Strokes:             {summary.stroke_count}")
    print(f"  Stroke rate:         {summary.avg_stroke_rate:6.1f} SPM   "
          f"(consistency CV {summary.stroke_rate_cv:.1f}%)")
    print(f"  Drive ratio:         {summary.avg_drive_percent:6.1f} %     "
          f"(CV {summary.drive_percent_cv:.1f}%)")
    print(f"  Peak drive accel:    {summary.avg_peak_drive_accel:6.2f} m/s²")
    print(f"  Catch sharpness:     {summary.avg_catch_sharpness:6.1f} m/s³")
    print(f"  Recovery check:      {summary.avg_check:6.2f} m/s²")
    print(f"  Distance:            {summary.distance_m:6.0f} m   "
          f"({summary.distance_per_stroke:.1f} m/stroke)")
    print(f"  Speed avg/max:       {summary.avg_speed:.2f} / {summary.max_speed:.2f} m/s")
    print(f"  Best split:          {split_str(summary.best_split_s)} /500m")
    print(f"  Boat set (roll RMS): {summary.roll_rms_deg:6.2f} deg")
    print("=" * 66)


def main():
    ap = argparse.ArgumentParser(description="Offline rowing analysis for .wrcdata")
    ap.add_argument("file", help="input .wrcdata file")
    ap.add_argument("--out-dir", default="analysis_out", help="output directory")
    args = ap.parse_args()

    reader = WRCDataReader(args.file)
    header, imu, gps, _cal = reader.read_as_numpy()
    print(f"Read {args.file}: V{header.version}, {len(imu)} IMU + {len(gps)} GPS samples")

    result = analyze(imu, gps)
    print_summary(result["summary"])
    write_outputs(result, args.out_dir)
    print(f"\nWrote: {args.out_dir}/summary.json, {args.out_dir}/strokes.csv, {args.out_dir}/analysis.png")


if __name__ == "__main__":
    main()
