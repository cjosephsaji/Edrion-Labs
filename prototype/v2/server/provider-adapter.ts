export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = 'PROVIDER_ERROR',
  ) {
    super(message);
  }
}
export async function structured<T>(
  name: string,
  schema: object,
  instructions: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || !key.startsWith('sk-'))
    throw new ProviderError(
      'AI teaching needs a valid server-side OPENAI_API_KEY. The simulations remain available.',
      503,
      'PROVIDER_NOT_CONFIGURED',
    );
  const model = process.env.PETROS_V2_TEACHER_MODEL || 'gpt-5.4-mini';
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: 5000,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name, strict: true, schema } },
    }),
    signal: AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(45000),
    ]),
    cache: 'no-store',
  });
  if (!r.ok) {
    if (r.status === 400 && process.env.NODE_ENV === 'development') {
      const diagnostic = await r.clone().json();
      console.error('Provider schema rejected', diagnostic.error?.message);
    }
    throw new ProviderError(
      r.status === 429
        ? 'The AI provider is out of quota or busy. Your experiment is saved.'
        : r.status === 401
          ? 'The AI provider rejected the server API key.'
          : 'The AI provider could not answer. Your experiment is saved.',
      r.status === 429 ? 429 : 503,
      `PROVIDER_${r.status}`,
    );
  }
  const p = await r.json();
  if (p.status !== 'completed')
    throw new ProviderError('AI response was incomplete. Please retry.');
  const messages = (p.output ?? []).filter(
    (i: { type: string }) => i.type === 'message',
  );
  const final =
    messages.findLast((i: { phase?: string }) => i.phase === 'final_answer') ??
    messages.at(-1);
  const output = final?.content
    ?.filter((c: { type: string }) => c.type === 'output_text')
    .map((c: { text: string }) => c.text)
    .join('');
  if (!output || output.length > 50000)
    throw new ProviderError('AI response was empty or too large.');
  try {
    return JSON.parse(output) as T;
  } catch {
    throw new ProviderError('AI returned invalid structured output.');
  }
}
