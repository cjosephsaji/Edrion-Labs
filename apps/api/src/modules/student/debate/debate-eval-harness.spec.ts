import { describe, expect, it } from 'vitest';
import { quoteMatchesTranscript } from './debate-quote-validator';

const FIXTURE_ROUNDS = [
  { transcript: 'we should ban homework because it harms wellbeing', quote: 'ban homework' },
  { transcript: 'the opposition fails to weigh economic impacts', quote: 'economic impacts' },
  { transcript: 'climate action requires immediate policy change', quote: 'immediate policy' },
  { transcript: 'free speech must include dissent on campus', quote: 'dissent on campus' },
  { transcript: 'universal healthcare saves lives and money', quote: 'saves lives' },
  { transcript: 'nuclear energy is safer than fossil fuels today', quote: 'safer than fossil' },
  { transcript: 'social media harms adolescent mental health', quote: 'mental health' },
  { transcript: 'voting rights protect democratic legitimacy', quote: 'democratic legitimacy' },
  { transcript: 'trade tariffs hurt consumers most', quote: 'hurt consumers' },
  { transcript: 'ai regulation should prioritize transparency', quote: 'prioritize transparency' },
  { transcript: 'school uniforms reduce bullying incidents', quote: 'reduce bullying' },
  { transcript: 'space exploration merits public funding', quote: 'public funding' },
  { transcript: 'cryptocurrency enables financial inclusion', quote: 'financial inclusion' },
  { transcript: 'animal testing should be phased out', quote: 'phased out' },
  { transcript: 'gap years improve college readiness', quote: 'college readiness' },
  { transcript: 'remote work increases productivity', quote: 'increases productivity' },
  { transcript: 'death penalty is not a deterrent', quote: 'not a deterrent' },
  { transcript: 'immigration strengthens the economy', quote: 'strengthens the economy' },
  { transcript: 'censorship undermines education', quote: 'undermines education' },
  { transcript: 'renewable storage solves intermittency', quote: 'solves intermittency' },
];

/** Blocking CI eval: 20-round quote validation corpus (LLM adjudication mocked via deterministic spans). */
describe('debate eval harness (20 rounds)', () => {
  it('validates adjudication quotes against transcripts', () => {
    let failures = 0;
    for (const round of FIXTURE_ROUNDS) {
      const ok = quoteMatchesTranscript(
        { verbatim: round.quote, start_ms: 0, end_ms: 5000 },
        round.transcript,
        [],
      );
      if (!ok) failures += 1;
    }
    expect(failures).toBe(0);
    expect(FIXTURE_ROUNDS.length).toBe(20);
  });
});
