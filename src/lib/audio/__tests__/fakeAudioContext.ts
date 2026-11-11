import type {
  AudioContextLike,
  AudioParamLike,
  GainNodeLike,
  OscillatorNodeLike,
  StereoPannerNodeLike,
} from '../webAudioTypes';

export class FakeAudioParam implements AudioParamLike {
  value = 0;
  setTargetAtTimeCalls = 0;
  setValueAtTimeCalls = 0;
  linearRampCalls = 0;

  setValueAtTime(value: number): void {
    this.value = value;
    this.setValueAtTimeCalls += 1;
  }

  setTargetAtTime(target: number): void {
    this.value = target;
    this.setTargetAtTimeCalls += 1;
  }

  linearRampToValueAtTime(value: number): void {
    this.value = value;
    this.linearRampCalls += 1;
  }
}

class FakeOscillator implements OscillatorNodeLike {
  type: OscillatorType = 'sine';
  frequency = new FakeAudioParam();
  started = false;
  stopped = false;

  connect(): OscillatorNodeLike {
    return this;
  }
  disconnect(): void {}

  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class FakeGain implements GainNodeLike {
  gain = new FakeAudioParam();
  connect(): GainNodeLike {
    return this;
  }
  disconnect(): void {}
}

class FakePanner implements StereoPannerNodeLike {
  pan = new FakeAudioParam();
  connect(): StereoPannerNodeLike {
    return this;
  }
  disconnect(): void {}
}

export class FakeAudioContext implements AudioContextLike {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  baseLatency = 0.02;
  outputLatency = 0.03;
  destination = new FakeGain();
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  closed = false;
  private listeners = new Map<string, Set<() => void>>();

  createOscillator(): OscillatorNodeLike {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }

  createGain(): GainNodeLike {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }

  createStereoPanner(): StereoPannerNodeLike {
    return new FakePanner();
  }

  async resume(): Promise<void> {
    this.state = 'running';
    this.emitStateChange();
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
    this.emitStateChange();
  }

  async close(): Promise<void> {
    this.state = 'closed';
    this.closed = true;
    this.emitStateChange();
  }

  addEventListener(type: 'statechange', listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: 'statechange', listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emitStateChange(): void {
    this.listeners.get('statechange')?.forEach((fn) => fn());
  }

  advanceTime(sec: number): void {
    this.currentTime += sec;
  }

  totalParamRetargetCalls(): number {
    let n = 0;
    for (const o of this.oscillators) {
      n += o.frequency.setTargetAtTimeCalls;
    }
    for (const g of this.gains) {
      n += g.gain.setTargetAtTimeCalls;
    }
    return n;
  }
}
