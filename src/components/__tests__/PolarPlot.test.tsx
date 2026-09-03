import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PolarPlot } from '../PolarPlot';
import { StabilityPlot } from '../StabilityPlot';

describe('live plots', () => {
  it('renders a polar canvas that can resize with the PWA shell', () => {
    const { container } = render(
      <PolarPlot samples={[]} historyStrokes={3} trailOpacity={50} />
    );
    expect(container.querySelector('canvas.polar-canvas')).not.toBeNull();
  });

  it('renders a stability canvas that can resize with the PWA shell', () => {
    const { container } = render(<StabilityPlot samples={[]} />);
    expect(container.querySelector('canvas.stability-canvas')).not.toBeNull();
  });
});
