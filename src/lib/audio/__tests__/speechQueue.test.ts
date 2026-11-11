import { describe, expect, it, vi } from 'vitest';
import { SpeechQueue } from '../speechQueue';
import type { SpeechSynthesisLike } from '../webAudioTypes';

describe('SpeechQueue', () => {
  it('requires utterances from the injected factory', () => {
    const marker = Symbol('utterance');
    const factory = vi.fn((text: string) => ({ text, marker }));
    const synth = {
      speak: vi.fn((u: { marker?: symbol }) => {
        if (u.marker !== marker) throw new TypeError('not a real utterance');
      }),
      cancel: vi.fn(),
      speaking: false,
      pending: false,
    };
    const q = new SpeechQueue(synth as unknown as SpeechSynthesisLike, factory);
    expect(q.speak('hello')).toBe(true);
    expect(synth.speak).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith('hello');
  });

  it('rejects plain objects when synth enforces real utterances', () => {
    const synth = {
      speak: vi.fn(() => {
        throw new TypeError('Illegal utterance');
      }),
      cancel: vi.fn(),
      speaking: false,
      pending: false,
    };
    const q = new SpeechQueue(synth as unknown as SpeechSynthesisLike, (text) => ({
      text,
    }));
    expect(q.speak('fail')).toBe(false);
  });
});
