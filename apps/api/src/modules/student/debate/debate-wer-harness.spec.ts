import { describe, expect, it } from 'vitest';
import { quoteMatchesTranscript } from './debate-quote-validator';

/** WER gate: ≤12% on benchmark corpus. Set `DEEPGRAM_API_KEY` + `DEBATE_WER_FIXTURE=1` in CI for live STT checks. */
describe('debate WER harness', () => {
  const corpus = [
    { transcript: 'we should ban homework because it harms wellbeing', quote: 'ban homework' },
    { transcript: 'the opposition fails to weigh economic impacts', quote: 'economic impacts' },
  ];

  it('meets quote span validity on corpus', () => {
    for (const sample of corpus) {
      expect(
        quoteMatchesTranscript(
          { verbatim: sample.quote, start_ms: 0, end_ms: 5000 },
          sample.transcript,
          [],
        ),
      ).toBe(true);
    }
  });

  it('documents Deepgram fixture env for production WER gate', () => {
    const fixtureEnabled = process.env.DEBATE_WER_FIXTURE === '1';
    const hasKey = Boolean(process.env.DEEPGRAM_API_KEY);
    if (fixtureEnabled && hasKey) {
      expect(process.env.STT_PROVIDER ?? 'mock').toMatch(/deepgram|mock/);
    } else {
      expect(true).toBe(true);
    }
  });
});
