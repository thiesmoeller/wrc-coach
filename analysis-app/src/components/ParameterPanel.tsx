import React from 'react';
import './ParameterPanel.css';

/**
 * Explains that analysis is data-driven — the same pipeline as the live PWA.
 * Catch/finish levels, phone heading, and mounting tilt are inferred from IMU
 * samples rather than tuned here.
 */
export const ParameterPanel: React.FC = () => {
  return (
    <div className="parameter-panel">
      <h3>Analysis Pipeline</h3>

      <p className="pipeline-lead">
        The same processing chain as the on-water app. Nothing here needs a
        manual threshold, calibration pose, or rower/coxswain setting.
      </p>

      <ol className="pipeline-steps">
        <li>
          <strong>Orientation</strong>
          A slow gravity tracker follows the phone's up direction from the
          accelerometer and gyro. Stroke acceleration is averaged out instead
          of being read as tilt.
        </li>
        <li>
          <strong>Boat frame</strong>
          The fore–aft axis is the main direction of acceleration in the phone.
          GPS speed changes confirm which end is the bow; until then the sharp
          acceleration at the catch does. Level is the boat's own average attitude.
        </li>
        <li>
          <strong>Stroke detection</strong>
          Catch and finish sit at surge zero-crossings, gated by a running
          amplitude scale so light paddling and race pressure both work.
        </li>
      </ol>
    </div>
  );
};
