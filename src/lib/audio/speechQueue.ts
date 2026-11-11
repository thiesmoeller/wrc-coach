import type { SpeechSynthesisLike, SpeechUtteranceLike } from './webAudioTypes';

export type UtteranceFactory = (text: string) => SpeechUtteranceLike;

export function defaultUtteranceFactory(text: string): SpeechUtteranceLike {
  if (typeof SpeechSynthesisUtterance !== 'undefined') {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.volume = 1;
    return utterance;
  }
  return { text, rate: 1.05, volume: 1 };
}

export function defaultSpeechSynthesis(): SpeechSynthesisLike | null {
  const synth = globalThis.speechSynthesis;
  if (!synth) return null;
  return synth as unknown as SpeechSynthesisLike;
}

export class SpeechQueue {
  private synth: SpeechSynthesisLike | null;
  private readonly createUtterance: UtteranceFactory;

  constructor(
    synth?: SpeechSynthesisLike | null,
    createUtterance: UtteranceFactory = defaultUtteranceFactory
  ) {
    this.synth = synth === undefined ? defaultSpeechSynthesis() : synth;
    this.createUtterance = createUtterance;
  }

  setSynthesis(synth: SpeechSynthesisLike | null): void {
    this.synth = synth;
  }

  speak(text: string): boolean {
    if (!this.synth) return false;
    if (this.synth.speaking || this.synth.pending) return false;
    const utterance = this.createUtterance(text);
    try {
      this.synth.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  cancel(): void {
    try {
      this.synth?.cancel();
    } catch {
      /* unavailable */
    }
  }
}
