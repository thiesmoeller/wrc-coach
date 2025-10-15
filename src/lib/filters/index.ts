/**
 * Signal Processing Filters
 * 
 * This module contains various filters used for processing IMU and GPS data
 * in the rowing coach application.
 */

export { KalmanFilterGPS } from './KalmanFilterGPS';
export { ComplementaryFilter, type Orientation } from './ComplementaryFilter';
export { BandPassFilter } from './BandPassFilter';
export { LowPassFilter } from './LowPassFilter';

