import { identity, consume, unlock } from './access';
import { teach, type TeacherInput } from './teacher-planner';
import { ProviderError } from './provider-adapter';
import { createVoiceSession } from './voice-session';
import { prototypeFeatures } from '../core/prototype-features';
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};
async function body(r: Request) {
  const reader = r.body?.getReader();
  if (!reader) throw Error('Request body required.');
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (true) {
    const x = await reader.read();
    if (x.done) break;
    n += x.value.length;
    if (n > 120000) {
      await reader.cancel();
      throw Error('Request exceeds 120 KB.');
    }
    chunks.push(x.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function handleV2(
  r: Request,
  action: string[],
  authorizedUser?: string,
) {
  const route = action.join('/');
  if (route === 'unlock' && r.method === 'POST') {
    try {
      await consume(
        r.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local',
        'unlock',
      );
      return await unlock(r);
    } catch {
      return Response.json(
        { error: 'Unlock temporarily unavailable.' },
        { status: 429, headers },
      );
    }
  }
  const user = authorizedUser ?? identity(r.headers);
  if (!user)
    return Response.json(
      { error: 'This private preview needs sign-in.' },
      { status: 401, headers },
    );
  if (route === 'status' && r.method === 'GET')
    return Response.json(
      {
        teacher:
          prototypeFeatures.liveAI &&
          !!process.env.OPENAI_API_KEY?.startsWith('sk-'),
        voice:
          prototypeFeatures.liveAI &&
          !!process.env.OPENAI_API_KEY?.startsWith('sk-'),
        provider: prototypeFeatures.liveAI ? 'openai' : 'prepared',
        aiPaused: !prototypeFeatures.liveAI,
      },
      { headers },
    );
  if (r.method !== 'POST') return new Response(null, { status: 405, headers });
  if (
    !r.headers.get('origin') ||
    new URL(r.headers.get('origin')!).host !== r.headers.get('host')
  )
    return new Response(null, { status: 403, headers });
  try {
    if (
      !prototypeFeatures.liveAI &&
      ['teacher', 'speech', 'voice'].includes(route)
    )
      return Response.json(
        {
          error:
            'Live AI is paused for this prototype. Choose a prepared question in the lesson.',
          code: 'AI_PAUSED',
        },
        { status: 503, headers },
      );
    if (route === 'speech') {
      await consume(user, 'speech');
      const input = await body(r);
      if (
        typeof input.text !== 'string' ||
        !input.text.trim() ||
        input.text.length > 1800
      )
        throw Error('Speech needs 1–1800 characters.');
      const key = process.env.OPENAI_API_KEY;
      if (!key)
        return Response.json(
          {
            error:
              'Provider voice unavailable. Device voice or captions remain available.',
          },
          { status: 503, headers },
        );
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice: 'coral',
          input: input.text,
          instructions:
            'Speak warmly and clearly as a patient science tutor. Read exactly the supplied text, with short natural pauses. Do not add any content.',
          response_format: 'mp3',
        }),
        signal: AbortSignal.any([r.signal, AbortSignal.timeout(30000)]),
        cache: 'no-store',
      });
      if (!response.ok)
        return Response.json(
          {
            error:
              'Spoken narration is temporarily unavailable. Continue with captions.',
          },
          { status: 503, headers },
        );
      return new Response(await response.arrayBuffer(), {
        headers: { ...headers, 'Content-Type': 'audio/mpeg' },
      });
    }
    if (route === 'teacher') {
      await consume(user, 'teacher');
      const input = (await body(r)) as TeacherInput;
      return Response.json(await teach(input, r.signal), { headers });
    }
    if (route === 'voice') {
      await consume(user, 'voice');
      return Response.json(await createVoiceSession(user, r.signal), {
        headers,
      });
    }
    return new Response(null, { status: 404, headers });
  } catch (e) {
    const status =
      e instanceof ProviderError
        ? e.status
        : e instanceof Error && /usage|accounting/i.test(e.message)
          ? 429
          : 400;
    return Response.json(
      {
        error: e instanceof Error ? e.message : 'Request failed.',
        code: e instanceof ProviderError ? e.code : 'INVALID_REQUEST',
      },
      { status, headers },
    );
  }
}
