/**
 * Convert m/s to min/500m split time
 * @param speedMS - Speed in meters per second
 * @returns Formatted split time (M:SS) or '--' if invalid
 */
export function convertToSplitTime(speedMS: number): string {
  if (speedMS <= 0) return '--';
  
  // Time to row 500m in seconds
  const timeSeconds = 500 / speedMS;
  
  // Convert to minutes and seconds
  const minutes = Math.floor(timeSeconds / 60);
  const seconds = Math.floor(timeSeconds % 60);
  
  // Format as M:SS
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate roll angle from accelerometer data
 * @param ax - X acceleration
 * @param ay - Y acceleration
 * @param az - Z acceleration
 * @returns Roll angle in degrees
 */
export function calculateRoll(ax: number, ay: number, az: number): number {
  // Simple roll estimation from accelerometer
  // Assumes phone is flat (screen up)
  const roll = Math.atan2(ax, Math.sqrt(ay * ay + az * az));
  return (roll * 180) / Math.PI; // Convert to degrees
}

