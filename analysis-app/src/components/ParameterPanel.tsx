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
          Madgwick AHRS tracks gravity from accel + gyro, so a tilted phone
          does not contaminate surge.
        </li>
        <li>
          <strong>Boat frame</strong>
          Principal-component analysis of horizontal linear accel finds the
          fore–aft axis. Drive skewness picks bow vs stern (rower or coxswain).
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
