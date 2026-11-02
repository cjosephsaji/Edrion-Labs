import { ProviderError } from './provider-adapter';
export async function createVoiceSession(user: string, signal: AbortSignal) {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.startsWith('sk-'))
    throw new ProviderError(
      'Realtime voice needs a valid server-side OpenAI API key.',
      503,
    );
  const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': user,
    },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 60 },
      session: {
        type: 'realtime',
        model: process.env.PETROS_V2_VOICE_MODEL || 'gpt-realtime',
        instructions:
          'You are the conversational voice of Petros. For ANY question, answer, experiment, explanation, or scene request, briefly acknowledge you will check the model, then call teach with the exact student utterance. Do not assert a result while waiting. Do not invent numerical results or teach from memory. The backend teacher runs simulations and produces verified teaching beats; the client will ask you to read those beats individually. Do not speak an extra answer after a teach tool result. Honor stop immediately. Be brief.',
        max_output_tokens: 700,
        audio: {
          input: {
            transcription: { model: 'gpt-4o-mini-transcribe' },
            turn_detection: {
              type: 'server_vad',
              silence_duration_ms: 900,
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: 'marin' },
        },
        tools: [
          {
            type: 'function',
            name: 'teach',
            description:
              'Ask the backend teacher to run tools and prepare verified visual/narration beats.',
            parameters: {
              type: 'object',
              properties: { question: { type: 'string' } },
              required: ['question'],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: 'auto',
      },
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    cache: 'no-store',
  });
  if (!r.ok)
    throw new ProviderError(
      r.status === 429
        ? 'Realtime quota is unavailable. Text and simulations remain usable.'
        : 'Realtime session could not be created. Check model access and the server API key.',
      503,
    );
  const p = await r.json();
  if (typeof p.value !== 'string' || typeof p.expires_at !== 'number')
    throw new ProviderError('Invalid ephemeral voice credential.');
  return { value: p.value, expires_at: p.expires_at, maxSeconds: 300 };
}
