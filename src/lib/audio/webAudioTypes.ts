/** Minimal Web Audio surface so tests can inject fakes (jsdom has no AudioContext). */

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  setTargetAtTime?(target: number, startTime: number, timeConstant: number): void;
  linearRampToValueAtTime?(value: number, endTime: number): void;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike;
  disconnect(): void;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: OscillatorType;
  frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface StereoPannerNodeLike extends AudioNodeLike {
  pan: AudioParamLike;
}

export interface AudioContextLike {
  readonly state: AudioContextState;
  readonly currentTime: number;
  readonly baseLatency?: number;
  readonly outputLatency?: number;
  readonly destination: AudioNodeLike;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  createStereoPanner?(): StereoPannerNodeLike;
  resume(): Promise<void>;
  close?(): Promise<void>;
  addEventListener?(type: 'statechange', listener: () => void): void;
  removeEventListener?(type: 'statechange', listener: () => void): void;
}

export interface SpeechUtteranceLike {
  text: string;
  volume?: number;
  rate?: number;
}

export interface SpeechSynthesisLike {
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  readonly speaking: boolean;
  readonly pending: boolean;
}
