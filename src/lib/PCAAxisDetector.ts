/**
 * PCA-based Axis Detection
 * 
 * Automatically detects the bow-stern axis of the boat by analyzing
 * the dominant direction of motion in IMU samples.
 * 
 * Theory: During rowing, the boat moves primarily along the bow-stern axis.
 * The first principal component of acceleration samples (with gravity removed)
 * will naturally align with this dominant direction.
 */

export interface DetectedAxes {
  /** First principal component - bow-stern axis (surge direction) */
  bowSternAxis: [number, number, number];
  
  /** Second principal component - port-starboard axis (sway direction) */
  portStarboardAxis: [number, number, number];
  
  /** Third principal component - vertical axis (heave direction) */
  verticalAxis: [number, number, number];
  
  /** Explained variance ratios for each component */
  explainedVariance: [number, number, number];
  
  /** Confidence score (0-1): ratio of first to second component variance */
  confidence: number;
}

export interface IMUSample {
  ax: number;
  ay: number;
  az: number;
}

/**
 * Detects boat axes using PCA on acceleration samples
 */
export class PCAAxisDetector {
  /**
   * Automatically detect boat axes from IMU samples
   * 
   * @param samples - Raw IMU acceleration samples (with gravity)
   * @param minMagnitude - Minimum acceleration magnitude to consider (default: 1 m/s², filters out near-stationary)
   * @returns Detected axes and confidence metrics
   */
  static detectAxes(
    samples: IMUSample[],
    minMagnitude: number = 1.0
  ): DetectedAxes | null {
    if (samples.length < 100) {
      console.log('PCA: Not enough samples');
      return null;
    }

    // Step 1: Estimate gravity vector from all samples (mean of accelerations)
    const gravity = this.estimateGravity(samples);
    console.log('PCA: Estimated gravity:', gravity.map(v => v.toFixed(3)));

    // Step 2: Remove gravity and filter for significant motion
    const dynamicSamples = samples
      .map(s => {
        const ax = s.ax - gravity[0];
        const ay = s.ay - gravity[1];
        const az = s.az - gravity[2];
        const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
        return { ax, ay, az, magnitude };
      })
      .filter(s => s.magnitude > minMagnitude);

    if (dynamicSamples.length < 50) {
      console.log('PCA: Not enough samples with significant motion');
      return null;
    }

    console.log(`PCA: Using ${dynamicSamples.length} / ${samples.length} samples with motion > ${minMagnitude} m/s²`);

    // Step 3: Build data matrix (each row is a sample)
    const data = dynamicSamples.map(s => [s.ax, s.ay, s.az]);

    // Step 4: Center the data (mean = 0 for each axis)
    const mean = [
      data.reduce((sum, s) => sum + s[0], 0) / data.length,
      data.reduce((sum, s) => sum + s[1], 0) / data.length,
      data.reduce((sum, s) => sum + s[2], 0) / data.length,
    ];

    const centered = data.map(s => [
      s[0] - mean[0],
      s[1] - mean[1],
      s[2] - mean[2],
    ]);

    // Step 5: Compute covariance matrix (3x3)
    const cov = this.computeCovarianceMatrix(centered);
    console.log('PCA: Covariance matrix:', cov.map(row => row.map(v => v.toFixed(4))));

    // Step 6: Compute eigenvalues and eigenvectors
    const eigen = this.computeEigen3x3(cov);
    
    if (!eigen) {
      console.log('PCA: Eigenvalue computation failed');
      return null;
    }

    // Sort by eigenvalue (descending)
    const sorted = eigen
      .map((e, i) => ({ value: e.value, vector: e.vector, index: i }))
      .sort((a, b) => b.value - a.value);

    // Normalize explained variance
    const totalVariance = sorted.reduce((sum, e) => sum + e.value, 0);
    const explainedVariance: [number, number, number] = [
      sorted[0].value / totalVariance,
      sorted[1].value / totalVariance,
      sorted[2].value / totalVariance,
    ];

    // Confidence: If rowing is dominant, first component should explain much more variance than second
    const confidence = explainedVariance[0] / (explainedVariance[0] + explainedVariance[1]);

    console.log('PCA: Explained variance:', explainedVariance.map(v => (v * 100).toFixed(1) + '%'));
    console.log('PCA: Confidence:', (confidence * 100).toFixed(1) + '%');

    // Principal components become our boat axes
    const bowSternAxis = sorted[0].vector as [number, number, number];
    const portStarboardAxis = sorted[1].vector as [number, number, number];
    const verticalAxis = sorted[2].vector as [number, number, number];

    return {
      bowSternAxis,
      portStarboardAxis,
      verticalAxis,
      explainedVariance,
      confidence,
    };
  }

  /**
   * Transform acceleration samples to detected boat frame
   * 
   * @param sample - Raw acceleration sample
   * @param axes - Detected axes from PCA
   * @param gravity - Gravity vector in phone frame
   * @returns Acceleration in boat frame (surge, sway, heave)
   */
  static transformToBoatFrame(
    sample: IMUSample,
    axes: DetectedAxes,
    gravity: [number, number, number]
  ): { surge: number; sway: number; heave: number } {
    // Remove gravity
    const ax = sample.ax - gravity[0];
    const ay = sample.ay - gravity[1];
    const az = sample.az - gravity[2];

    // Project onto boat axes (dot product)
    const surge = ax * axes.bowSternAxis[0] + ay * axes.bowSternAxis[1] + az * axes.bowSternAxis[2];
    const sway = ax * axes.portStarboardAxis[0] + ay * axes.portStarboardAxis[1] + az * axes.portStarboardAxis[2];
    const heave = ax * axes.verticalAxis[0] + ay * axes.verticalAxis[1] + az * axes.verticalAxis[2];

    return { surge, sway, heave };
  }

  /**
   * Estimate gravity vector from samples (assumes average orientation doesn't change much)
   */
  private static estimateGravity(samples: IMUSample[]): [number, number, number] {
    // Use median instead of mean to be robust to motion outliers
    const ax = samples.map(s => s.ax).sort((a, b) => a - b);
    const ay = samples.map(s => s.ay).sort((a, b) => a - b);
    const az = samples.map(s => s.az).sort((a, b) => a - b);
    
    const mid = Math.floor(samples.length / 2);
    return [ax[mid], ay[mid], az[mid]];
  }

  /**
   * Compute 3x3 covariance matrix from centered data
   */
  private static computeCovarianceMatrix(data: number[][]): number[][] {
    const n = data.length;
    const cov = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < n; k++) {
          cov[i][j] += data[k][i] * data[k][j];
        }
        cov[i][j] /= n;
      }
    }

    return cov;
  }

  /**
   * Compute eigenvalues and eigenvectors of 3x3 symmetric matrix
   * Uses power iteration for simplicity (sufficient for our use case)
   * 
   * For production, could use numeric libraries, but this keeps dependencies minimal.
   */
  private static computeEigen3x3(
    matrix: number[][]
  ): { value: number; vector: number[] }[] | null {
    const maxIterations = 100;
    const tolerance = 1e-6;
    const results: { value: number; vector: number[] }[] = [];

    // Work on a copy
    let A = matrix.map(row => [...row]);

    // Find 3 eigenvalues/vectors using deflation
    for (let i = 0; i < 3; i++) {
      // Power iteration to find dominant eigenvector
      let v = [1, 1, 1]; // Initial guess
      let eigenvalue = 0;

      for (let iter = 0; iter < maxIterations; iter++) {
        // v_new = A * v
        const v_new = [
          A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
          A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
          A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2],
        ];

        // Compute eigenvalue (Rayleigh quotient)
        const norm_v = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        const norm_v_new = Math.sqrt(v_new[0] * v_new[0] + v_new[1] * v_new[1] + v_new[2] * v_new[2]);
        eigenvalue = norm_v_new / norm_v;

        // Normalize
        v = [v_new[0] / norm_v_new, v_new[1] / norm_v_new, v_new[2] / norm_v_new];

        // Check convergence
        if (iter > 10 && Math.abs(norm_v_new - norm_v) < tolerance) {
          break;
        }
      }

      results.push({ value: eigenvalue, vector: v });

      // Deflate: A = A - eigenvalue * v * v^T
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          A[row][col] -= eigenvalue * v[row] * v[col];
        }
      }
    }

    return results;
  }
}

