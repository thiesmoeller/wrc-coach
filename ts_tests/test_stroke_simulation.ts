#!/usr/bin/env tsx
/**
 * Standalone test program for stroke simulation and detection with calibration
 * Run with: npx tsx test_stroke_simulation.ts
 */

import { BandPassFilter, LowPassFilter } from './src/lib/filters';
import { StrokeDetector } from './src/lib/stroke-detection';

// ============================================================================
// CALIBRATION SYSTEM
// ============================================================================

/**
 * Calibration data for phone mounting position and pose
 */
interface CalibrationData {
  // Mounting orientation offsets (degrees)
  pitchOffset: number;  // Tilt forward/backward from horizontal
  rollOffset: number;   // Tilt port/starboard from horizontal
  yawOffset: number;    // Rotation around vertical axis
  
  // Position offsets (meters)
  lateralOffset: number;  // Distance from boat centerline (+ = starboard)
  
  // Gravity reference
  gravityMagnitude: number;  // Measured gravity when at rest
  
  // Calibration quality metrics
  samples: number;
  timestamp: number;
}

/**
 * Calibration manager for phone mounting
 */
class PhoneCalibration {
  private calibrationData: CalibrationData | null = null;
  private calibrationSamples: Array<{
    ax: number;
    ay: number;
    az: number;
    gx: number;
    gy: number;
    gz: number;
  }> = [];
  
  /**
   * Start calibration - collect samples when boat is at rest or steady state
   */
  startCalibration() {
    this.calibrationSamples = [];
    console.log('📍 Starting calibration...');
    console.log('   Keep the boat steady for 3-5 seconds');
  }
  
  /**
   * Add a sample during calibration
   */
  addCalibrationSample(ax: number, ay: number, az: number, gx: number, gy: number, gz: number) {
    this.calibrationSamples.push({ ax, ay, az, gx, gy, gz });
  }
  
  /**
   * Complete calibration and calculate offsets
   */
  completeCalibration(): CalibrationData {
    if (this.calibrationSamples.length < 50) {
      throw new Error('Not enough calibration samples (need at least 50)');
    }
    
    // Calculate average accelerometer readings (should be gravity only when at rest)
    const avgAx = this.calibrationSamples.reduce((sum, s) => sum + s.ax, 0) / this.calibrationSamples.length;
    const avgAy = this.calibrationSamples.reduce((sum, s) => sum + s.ay, 0) / this.calibrationSamples.length;
    const avgAz = this.calibrationSamples.reduce((sum, s) => sum + s.az, 0) / this.calibrationSamples.length;
    
    // Calculate gravity magnitude
    const gravityMagnitude = Math.sqrt(avgAx * avgAx + avgAy * avgAy + avgAz * avgAz);
    
    // Calculate mounting orientation from gravity vector
    // When at rest, accelerometer reads only gravity
    // Ideal: gravity should be [0, 0, -9.8] for level phone
    
    // The measured angle is OPPOSITE to the mounting rotation angle:
    // If phone is rotated +15° (tilted forward), gravity appears at -15° from vertical
    
    // Roll offset: rotation around Y-axis (boat surge axis)
    // When phone is tilted to starboard (+roll), gravity appears in +X  
    const rollOffset = -Math.atan2(avgAx, Math.sqrt(avgAy * avgAy + avgAz * avgAz)) * 180 / Math.PI;
    
    // Pitch offset: rotation around X-axis (boat sway axis)  
    // When phone is tilted forward (+pitch), gravity appears in +Y
    const pitchOffset = -Math.atan2(avgAy, Math.sqrt(avgAx * avgAx + avgAz * avgAz)) * 180 / Math.PI;
    
    // Yaw offset: cannot be determined from gravity alone
    // Would need magnetic compass or known heading
    const yawOffset = 0;
    
    // Lateral offset: cannot be determined from static calibration
    // Would need dynamic calibration (analyze roll during rowing)
    const lateralOffset = 0;
    
    this.calibrationData = {
      pitchOffset,
      rollOffset,
      yawOffset,
      lateralOffset,
      gravityMagnitude,
      samples: this.calibrationSamples.length,
      timestamp: Date.now(),
    };
    
    console.log('✅ Calibration complete:');
    console.log(`   Pitch offset: ${pitchOffset.toFixed(2)}°`);
    console.log(`   Roll offset: ${rollOffset.toFixed(2)}°`);
    console.log(`   Gravity: ${gravityMagnitude.toFixed(3)} m/s²`);
    console.log(`   Samples: ${this.calibrationData.samples}`);
    
    return this.calibrationData;
  }
  
  /**
   * Apply calibration to raw sensor data
   */
  applyCalibration(ax: number, ay: number, az: number): { ax: number; ay: number; az: number } {
    if (!this.calibrationData) {
      return { ax, ay, az }; // No calibration, return raw
    }
    
    const { pitchOffset, rollOffset } = this.calibrationData;
    
    // Convert offsets to radians (negative to undo the rotation)
    const pitch = -pitchOffset * Math.PI / 180;
    const roll = -rollOffset * Math.PI / 180;
    
    // Apply inverse rotation to undo mounting offset
    // Undo pitch first (opposite order of application)
    let ax1 = ax;
    let ay1 = ay * Math.cos(pitch) + az * Math.sin(pitch);
    let az1 = -ay * Math.sin(pitch) + az * Math.cos(pitch);
    
    // Then undo roll
    const ax2 = ax1 * Math.cos(roll) - az1 * Math.sin(roll);
    const ay2 = ay1;
    const az2 = ax1 * Math.sin(roll) + az1 * Math.cos(roll);
    
    return { ax: ax2, ay: ay2, az: az2 };
  }
  
  /**
   * Dynamic calibration: estimate lateral offset from roll patterns
   * Call this during steady rowing to refine lateral offset
   */
  estimateLateralOffset(rollAngle: number, heelAngle: number, boatSpeed: number) {
    // When rowing, roll is caused by:
    // 1. Rower weight shift (actual boat roll)
    // 2. Phone position offset from centerline
    // 
    // If phone is offset, it experiences centripetal acceleration
    // a_lateral = r * ω² where r = lateral offset, ω = roll rate
    //
    // This would require integrating roll patterns over multiple strokes
    // and comparing expected vs measured lateral acceleration
    
    // Placeholder for advanced calibration
    // Would need multiple strokes of data to estimate this accurately
  }
  
  getCalibrationData(): CalibrationData | null {
    return this.calibrationData;
  }
  
  loadCalibration(data: CalibrationData) {
    this.calibrationData = data;
    console.log('📍 Loaded calibration from', new Date(data.timestamp).toLocaleString());
  }
}

// Simulate realistic rowing IMU data with mounting offsets
function generateStrokeData(
  durationSeconds: number = 10,
  mountingPitchOffset: number = 0,  // degrees
  mountingRollOffset: number = 0    // degrees
) {
  const strokeRate = 25; // SPM
  const strokePeriod = 60000 / strokeRate; // ms per stroke
  const sampleRate = 50; // Hz
  const dt = 1000 / sampleRate; // ms between samples
  
  const samples: Array<{ t: number; ax: number; ay: number; az: number; gx: number; gy: number; gz: number }> = [];
  let t = 0;
  
  // Convert mounting offsets to radians
  const pitchRad = mountingPitchOffset * Math.PI / 180;
  const rollRad = mountingRollOffset * Math.PI / 180;
  
  while (t < durationSeconds * 1000) {
    const cyclePosition = (t % strokePeriod) / strokePeriod;
    
    // Research-based optimal pattern (compensated for filter effects)
    // Based on Kleshnev, Holt et al., Greidanus studies
    let surge: number;
    
    if (cyclePosition < 0.05) {
      // PRE-CATCH CHECK: Minimal but unavoidable deceleration
      // "Check should be as narrow and shallow as possible" - PLOS
      const checkPhase = cyclePosition / 0.05;
      surge = -0.5 * Math.sin(checkPhase * Math.PI);
      
    } else if (cyclePosition < 0.08) {
      // CATCH TRANSITION: Rapid reversal from decel to accel
      // "Cross zero acceleration quickly" - rowinginmotion
      const transitionPhase = (cyclePosition - 0.05) / 0.03;
      surge = -0.5 + (3.5 * transitionPhase); // Sharp rise
      
    } else if (cyclePosition < 0.35) {
      // DRIVE PHASE: Smooth continuous positive acceleration
      // Dual-peak pattern (legs → back → arms) - Kleshnev
      const drivePhase = (cyclePosition - 0.08) / 0.27;
      
      if (drivePhase < 0.4) {
        // First peak (leg drive)
        surge = 3.2 * Math.sin(drivePhase * Math.PI / 0.4);
      } else if (drivePhase < 0.5) {
        // Transition (legs → back)
        surge = 2.8 - (drivePhase - 0.4) * 2.0;
      } else {
        // Second peak (back + arms)
        surge = 2.6 + 0.6 * Math.sin((drivePhase - 0.5) * Math.PI / 0.5);
      }
      
    } else if (cyclePosition < 0.40) {
      // FINISH/EXTRACTION: Clean taper, minimal reverse
      // "Finish cleanly, minimize losses" - Archinisis
      const finishPhase = (cyclePosition - 0.35) / 0.05;
      surge = 2.6 * (1 - finishPhase) - 0.3 * finishPhase;
      
    } else if (cyclePosition < 0.75) {
      // EARLY RECOVERY: Preserve forward velocity
      // "Minimal deceleration, smooth and controlled" - rowinginmotion
      const recoveryPhase = (cyclePosition - 0.40) / 0.35;
      surge = -0.25 * Math.sin(recoveryPhase * Math.PI);
      
    } else {
      // LATE RECOVERY: Approach to catch
      // "Soft approach, set up for clean catch" - Archinisis
      const approachPhase = (cyclePosition - 0.75) / 0.25;
      surge = -0.15 - 0.25 * Math.sin(approachPhase * Math.PI * 0.8);
    }
    
    // Minimal noise (real sensors have some)
    const noise = (Math.random() - 0.5) * 0.05;
    
    // Ideal sensor readings (phone perfectly aligned with boat)
    const ax_ideal = (Math.random() - 0.5) * 0.05; // minimal lateral
    const ay_ideal = surge + noise; // surge acceleration
    const az_ideal = -9.8 + (Math.random() - 0.5) * 0.1; // gravity + small variations
    
    // Apply mounting offset rotation (simulate misaligned phone)
    // First rotate around X-axis (pitch offset)
    const ax1 = ax_ideal;
    const ay1 = ay_ideal * Math.cos(pitchRad) + az_ideal * Math.sin(pitchRad);
    const az1 = -ay_ideal * Math.sin(pitchRad) + az_ideal * Math.cos(pitchRad);
    
    // Then rotate around Y-axis (roll offset)
    const ax = ax1 * Math.cos(rollRad) - az1 * Math.sin(rollRad);
    const ay = ay1;
    const az = ax1 * Math.sin(rollRad) + az1 * Math.cos(rollRad);
    
    // Simulate gyroscope (angular rates)
    const gx = Math.sin(cyclePosition * Math.PI * 2) * 3 + (Math.random() - 0.5) * 0.5; // roll rate
    const gy = Math.cos(cyclePosition * Math.PI * 2) * 2 + (Math.random() - 0.5) * 0.3; // pitch rate
    const gz = (Math.random() - 0.5) * 0.5; // yaw rate (minimal)
    
    samples.push({ t, ax, ay, az, gx, gy, gz });
    t += dt;
  }
  
  return samples;
}

// Test calibration system
function testCalibration() {
  console.log('='.repeat(80));
  console.log('CALIBRATION TEST');
  console.log('='.repeat(80));
  console.log();
  
  // Simulate phone mounted with offsets
  const mountingPitch = 15; // degrees (phone tilted forward)
  const mountingRoll = -8; // degrees (phone tilted to port)
  
  console.log('Simulating phone mounting:');
  console.log(`  Pitch offset: ${mountingPitch}° (tilted forward)`);
  console.log(`  Roll offset: ${mountingRoll}° (tilted to port)`);
  console.log();
  
  // Generate calibration data (boat at rest)
  console.log('Step 1: Collecting calibration samples (boat at rest)...');
  const calibration = new PhoneCalibration();
  calibration.startCalibration();
  
  // Simulate 3 seconds at rest
  for (let i = 0; i < 150; i++) {
    // At rest: only gravity
    const ax_ideal = 0;
    const ay_ideal = 0;
    const az_ideal = -9.8;
    
    // Apply mounting rotation
    const pitchRad = mountingPitch * Math.PI / 180;
    const rollRad = mountingRoll * Math.PI / 180;
    
    const ax1 = ax_ideal;
    const ay1 = ay_ideal * Math.cos(pitchRad) + az_ideal * Math.sin(pitchRad);
    const az1 = -ay_ideal * Math.sin(pitchRad) + az_ideal * Math.cos(pitchRad);
    
    const ax = ax1 * Math.cos(rollRad) - az1 * Math.sin(rollRad);
    const ay = ay1;
    const az = ax1 * Math.sin(rollRad) + az1 * Math.cos(rollRad);
    
    // Add minimal noise
    const noise = 0.01;
    calibration.addCalibrationSample(
      ax + (Math.random() - 0.5) * noise,
      ay + (Math.random() - 0.5) * noise,
      az + (Math.random() - 0.5) * noise,
      0, 0, 0
    );
  }
  
  const calibData = calibration.completeCalibration();
  console.log();
  
  // Verify calibration accuracy
  console.log('Calibration accuracy check:');
  console.log(`  Expected pitch: ${mountingPitch.toFixed(2)}°`);
  console.log(`  Detected pitch: ${calibData.pitchOffset.toFixed(2)}°`);
  console.log(`  Error: ${Math.abs(calibData.pitchOffset - mountingPitch).toFixed(2)}°`);
  console.log();
  console.log(`  Expected roll: ${mountingRoll.toFixed(2)}°`);
  console.log(`  Detected roll: ${calibData.rollOffset.toFixed(2)}°`);
  console.log(`  Error: ${Math.abs(calibData.rollOffset - mountingRoll).toFixed(2)}°`);
  console.log();
  
  // Test calibration correction
  console.log('Step 2: Testing calibration correction...');
  
  // Create a test acceleration with known values in boat frame
  const surge_true = 2.0; // m/s²
  const ax_ideal = 0;
  const ay_ideal = surge_true;
  const az_ideal = -9.8;
  
  // Apply mounting offset (simulate what sensor sees)
  const pitchRad = mountingPitch * Math.PI / 180;
  const rollRad = mountingRoll * Math.PI / 180;
  
  const ax1 = ax_ideal;
  const ay1 = ay_ideal * Math.cos(pitchRad) + az_ideal * Math.sin(pitchRad);
  const az1 = -ay_ideal * Math.sin(pitchRad) + az_ideal * Math.cos(pitchRad);
  
  const ax_raw = ax1 * Math.cos(rollRad) - az1 * Math.sin(rollRad);
  const ay_raw = ay1;
  const az_raw = ax1 * Math.sin(rollRad) + az1 * Math.cos(rollRad);
  
  console.log('Test acceleration (boat frame):');
  console.log(`  True surge: ${surge_true.toFixed(3)} m/s²`);
  console.log();
  console.log('Raw sensor reading (with mounting offset):');
  console.log(`  ax: ${ax_raw.toFixed(3)} m/s²`);
  console.log(`  ay: ${ay_raw.toFixed(3)} m/s²`);
  console.log(`  az: ${az_raw.toFixed(3)} m/s²`);
  console.log();
  
  // Apply calibration correction
  const corrected = calibration.applyCalibration(ax_raw, ay_raw, az_raw);
  console.log('After calibration correction:');
  console.log(`  ax: ${corrected.ax.toFixed(3)} m/s² (expected: 0)`);
  console.log(`  ay: ${corrected.ay.toFixed(3)} m/s² (expected: ${surge_true.toFixed(3)})`);
  console.log(`  az: ${corrected.az.toFixed(3)} m/s² (expected: -9.8)`);
  console.log();
  
  const surge_error = Math.abs(corrected.ay - surge_true);
  if (surge_error < 0.1) {
    console.log('✅ Calibration correction successful (error < 0.1 m/s²)');
  } else {
    console.log(`⚠️  Calibration error: ${surge_error.toFixed(3)} m/s²`);
  }
  console.log();
  
  return calibration;
}

// Test the filtering and detection pipeline with calibration
function testPipeline(calibration?: PhoneCalibration) {
  console.log('='.repeat(80));
  console.log('STROKE DETECTION TEST WITH CALIBRATION');
  console.log('='.repeat(80));
  console.log();
  
  // Generate data with mounting offsets
  const mountingPitch = 15;
  const mountingRoll = -8;
  console.log('Generating synthetic IMU data with mounting offsets...');
  console.log(`  Pitch: ${mountingPitch}°, Roll: ${mountingRoll}°`);
  const rawSamples = generateStrokeData(10, mountingPitch, mountingRoll); // 10 seconds
  console.log(`Generated ${rawSamples.length} samples`);
  console.log();
  
  // Initialize filters and detector
  const bandPass = new BandPassFilter(0.3, 1.2, 50);
  const lowPass = new LowPassFilter(0.85);
  const detector = new StrokeDetector({
    catchThreshold: 0.6,
    finishThreshold: -0.3,
  });
  
  console.log('Filter configuration:');
  console.log('  Band-pass: 0.3-1.2 Hz @ 50 Hz sample rate');
  console.log('  Low-pass: alpha = 0.85');
  console.log('  Catch threshold: 0.6 m/s²');
  console.log('  Finish threshold: -0.3 m/s²');
  if (calibration) {
    console.log('  ✅ Using calibration correction');
  } else {
    console.log('  ⚠️  No calibration - using raw sensor data');
  }
  console.log();
  
  // Process samples
  const processedSamples: Array<{
    t: number;
    raw: number;
    calibrated: number;
    bandpassed: number;
    filtered: number;
    inDrive: boolean;
  }> = [];
  
  const strokes: Array<{
    catchTime: number;
    finishTime: number;
    duration: number;
    driveTime: number;
    recoveryTime: number;
    drivePercent: number;
    strokeRate: number;
  }> = [];
  
  let lastTime = 0;
  
  for (const sample of rawSamples) {
    const dt = lastTime > 0 ? (sample.t - lastTime) / 1000 : 0.02;
    lastTime = sample.t;
    
    // Apply calibration correction if available
    let surge = sample.ay; // Default: use raw Y-axis
    if (calibration) {
      const corrected = calibration.applyCalibration(sample.ax, sample.ay, sample.az);
      surge = corrected.ay; // Use calibrated Y-axis (surge)
    }
    
    // Apply filters
    const bandpassed = bandPass.process(surge);
    const filtered = lowPass.process(bandpassed);
    
    // Detect strokes
    const completedStroke = detector.process(sample.t, filtered);
    
    if (completedStroke) {
      strokes.push({
        catchTime: completedStroke.catchTime,
        finishTime: completedStroke.finishTime,
        duration: completedStroke.driveTime + completedStroke.recoveryTime,
        driveTime: completedStroke.driveTime,
        recoveryTime: completedStroke.recoveryTime,
        drivePercent: completedStroke.drivePercent || 0,
        strokeRate: completedStroke.strokeRate || 0,
      });
    }
    
    processedSamples.push({
      t: sample.t,
      raw: sample.ay,
      calibrated: surge,
      bandpassed,
      filtered,
      inDrive: detector.isInDrive(),
    });
  }
  
  // Print results
  console.log('='.repeat(80));
  console.log('DETECTED STROKES');
  console.log('='.repeat(80));
  console.log();
  
  if (strokes.length === 0) {
    console.log('⚠️  NO STROKES DETECTED!');
    console.log('This suggests the thresholds are not being crossed.');
    console.log();
  } else {
    console.log(`Found ${strokes.length} strokes\n`);
    
    strokes.forEach((stroke, i) => {
      console.log(`Stroke ${i + 1}:`);
      console.log(`  Duration: ${(stroke.duration / 1000).toFixed(2)}s`);
      console.log(`  Drive time: ${(stroke.driveTime / 1000).toFixed(2)}s`);
      console.log(`  Recovery time: ${(stroke.recoveryTime / 1000).toFixed(2)}s`);
      console.log(`  Drive %: ${stroke.drivePercent.toFixed(1)}%`);
      console.log(`  Stroke rate: ${stroke.strokeRate.toFixed(1)} SPM`);
      console.log();
    });
    
    // Calculate averages
    const avgDrive = strokes.reduce((sum, s) => sum + s.drivePercent, 0) / strokes.length;
    const avgRate = strokes.reduce((sum, s) => sum + s.strokeRate, 0) / strokes.length;
    
    console.log('AVERAGES:');
    console.log(`  Drive %: ${avgDrive.toFixed(1)}% (target: 33% optimal)`);
    console.log(`  Stroke rate: ${avgRate.toFixed(1)} SPM (target: 25 SPM)`);
    console.log();
    
    if (Math.abs(avgDrive - 33) > 10) {
      console.log('⚠️  WARNING: Drive % is significantly different from optimal target!');
    } else {
      console.log('✓ Drive % within acceptable range of optimal (33%)');
    }
  }
  
  // Print sample statistics
  console.log('='.repeat(80));
  console.log('SIGNAL STATISTICS');
  console.log('='.repeat(80));
  console.log();
  
  const rawValues = processedSamples.map(s => s.raw);
  const calibratedValues = processedSamples.map(s => s.calibrated);
  const filteredValues = processedSamples.map(s => s.filtered);
  
  console.log('Raw signal (sensor Y-axis):');
  console.log(`  Min: ${Math.min(...rawValues).toFixed(3)} m/s²`);
  console.log(`  Max: ${Math.max(...rawValues).toFixed(3)} m/s²`);
  console.log(`  Mean: ${(rawValues.reduce((a, b) => a + b, 0) / rawValues.length).toFixed(3)} m/s²`);
  console.log();
  
  if (calibration) {
    console.log('Calibrated signal (corrected surge):');
    console.log(`  Min: ${Math.min(...calibratedValues).toFixed(3)} m/s²`);
    console.log(`  Max: ${Math.max(...calibratedValues).toFixed(3)} m/s²`);
    console.log(`  Mean: ${(calibratedValues.reduce((a, b) => a + b, 0) / calibratedValues.length).toFixed(3)} m/s²`);
    console.log();
  }
  
  console.log('Filtered signal:');
  console.log(`  Min: ${Math.min(...filteredValues).toFixed(3)} m/s²`);
  console.log(`  Max: ${Math.max(...filteredValues).toFixed(3)} m/s²`);
  console.log(`  Mean: ${(filteredValues.reduce((a, b) => a + b, 0) / filteredValues.length).toFixed(3)} m/s²`);
  console.log();
  
  // Check threshold crossings
  const aboveCatchThreshold = filteredValues.filter(v => v > 0.6).length;
  const belowFinishThreshold = filteredValues.filter(v => v < -0.3).length;
  
  console.log('Threshold crossings:');
  console.log(`  Above catch threshold (0.6): ${aboveCatchThreshold} samples (${(aboveCatchThreshold / filteredValues.length * 100).toFixed(1)}%)`);
  console.log(`  Below finish threshold (-0.3): ${belowFinishThreshold} samples (${(belowFinishThreshold / filteredValues.length * 100).toFixed(1)}%)`);
  console.log();
  
  // Export first stroke for detailed analysis
  if (processedSamples.length > 0) {
    console.log('='.repeat(80));
    console.log('FIRST 2 SECONDS (sample data)');
    console.log('='.repeat(80));
    console.log();
    
    if (calibration) {
      console.log('Time(s)  Raw      Calib    BandPass  Filtered  InDrive');
      console.log('-'.repeat(70));
      
      const firstTwoSec = processedSamples.filter(s => s.t < 2000);
      firstTwoSec.forEach((s, i) => {
        if (i % 10 === 0) { // Print every 10th sample to avoid clutter
          console.log(
            `${(s.t / 1000).toFixed(2).padStart(6)}  ` +
            `${s.raw.toFixed(3).padStart(7)}  ` +
            `${s.calibrated.toFixed(3).padStart(7)}  ` +
            `${s.bandpassed.toFixed(3).padStart(8)}  ` +
            `${s.filtered.toFixed(3).padStart(8)}  ` +
            `${s.inDrive ? 'DRIVE' : 'recovery'}`
          );
        }
      });
    } else {
      console.log('Time(s)  Raw      BandPass  Filtered  InDrive');
      console.log('-'.repeat(60));
      
      const firstTwoSec = processedSamples.filter(s => s.t < 2000);
      firstTwoSec.forEach((s, i) => {
        if (i % 10 === 0) {
          console.log(
            `${(s.t / 1000).toFixed(2).padStart(6)}  ` +
            `${s.raw.toFixed(3).padStart(7)}  ` +
            `${s.bandpassed.toFixed(3).padStart(8)}  ` +
            `${s.filtered.toFixed(3).padStart(8)}  ` +
            `${s.inDrive ? 'DRIVE' : 'recovery'}`
          );
        }
      });
    }
    console.log();
  }
}

// Main test runner
console.log('\n');
console.log('╔' + '═'.repeat(78) + '╗');
console.log('║' + ' '.repeat(20) + 'PHONE CALIBRATION & STROKE DETECTION TEST' + ' '.repeat(17) + '║');
console.log('╚' + '═'.repeat(78) + '╝');
console.log('\n');

// Test 1: Calibration system
const calibration = testCalibration();
console.log('\n');

// Test 2: Pipeline WITHOUT calibration (showing the problem)
console.log('='.repeat(80));
console.log('COMPARISON TEST: WITHOUT CALIBRATION');
console.log('='.repeat(80));
console.log();
testPipeline();
console.log('\n');

// Test 3: Pipeline WITH calibration (showing the fix)
console.log('='.repeat(80));
console.log('COMPARISON TEST: WITH CALIBRATION');
console.log('='.repeat(80));
console.log();
testPipeline(calibration);

