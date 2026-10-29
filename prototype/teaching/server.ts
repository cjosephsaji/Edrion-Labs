import { readFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { showcaseAccess } from './access';
import manifest from '../assets/source-manifest.json';
import { RUNTIME_ASSETS } from '../assets/realism/runtime-manifest';
import type { LessonId } from './types';
const MODULES: LessonId[] = ['ai3', 'ai4', 'ehs3', 'ehs5'];
export const MAX_BYTES = 20 * 1024 * 1024;
export function recognize(hash: string) {
  const i = manifest.source_files.findIndex((f) => f.sha256 === hash);
  return i < 0 ? null : MODULES[i]!;
}
function root() {
  if (existsSync(join(process.cwd(), 'CODEX_IMPLEMENTATION.md')))
    return process.cwd();
  return existsSync(join(process.cwd(), 'prototype/CODEX_IMPLEMENTATION.md'))
    ? join(process.cwd(), 'prototype')
    : resolve(process.cwd(), '../../prototype');
}
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
};
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: privateHeaders });
}
export async function extract(buffer: Buffer, signal?: AbortSignal) {
  if (buffer.length > MAX_BYTES) throw Error('PDF exceeds the 20 MB limit.');
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))
    throw Error('This file is not a readable PDF.');
  const repo = resolve(root(), '..');
  const parser = await realpath(
    join(repo, 'apps/api/src/modules/student/knowledge/pdf-extract.cjs'),
  );
  const pdf = await realpath(
    join(repo, 'apps/api/node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
  );
  return await new Promise<{ pages: string[]; fileSha256: string }>(
    (done, fail) => {
      const child = spawn(
        process.execPath,
        [
          '--max-old-space-size=128',
          '--permission',
          `--allow-fs-read=${parser}`,
          `--allow-fs-read=${dirname(dirname(dirname(pdf)))}`,
          parser,
          pdf,
        ],
        {
          env: { PATH: '/usr/bin:/bin', LANG: 'C', NODE_ENV: 'production' },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let output = '',
        size = 0,
        settled = false;
      const stop = (message: string) => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        fail(Error(message));
      };
      const timer = setTimeout(
        () => stop('Extraction exceeded 20 seconds. Try a smaller PDF.'),
        20_000,
      );
      const abort = () => stop('Upload cancelled.');
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.stdout.on('data', (data: Buffer) => {
        size += data.length;
        if (size > 8 * 1024 * 1024)
          stop('Extracted text exceeded the demo limit.');
        else output += data;
      });
      child.stderr.on('data', (data: Buffer) => {
        size += data.length;
        if (size > 8 * 1024 * 1024) stop('PDF diagnostic limit exceeded.');
      });
      child.stdin.on('error', () => {});
      child.on('error', () => stop('PDF extraction runtime is unavailable.'));
      child.on('close', (code) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (settled) return;
        try {
          if (code !== 0) throw Error();
          const lines = output
            .trim()
            .split('\n')
            .map((x) => JSON.parse(x));
          const result = lines.find((x) => x.result)?.result;
          if (!result || result.pages.length > 200 || result.pages.length < 1)
            throw Error();
          if (
            result.fileSha256 !==
            createHash('sha256').update(buffer).digest('hex')
          )
            throw Error();
          settled = true;
          done(result);
        } catch {
          stop(
            'Could not extract this PDF. It may be damaged, encrypted, or exceed the 200-page limit.',
          );
        }
      });
      child.stdin.end(buffer);
    },
  );
}
async function boundedForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('Select a PDF file.');
  const chunks: Buffer[] = [];
  let size = 0,
    timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, 20_000);
  try {
    for (;;) {
      const chunk = await reader.read();
      if (timedOut) throw Error('Upload exceeded 20 seconds.');
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > MAX_BYTES + 1024 * 1024) {
        await reader.cancel();
        throw Error('PDF exceeds the 20 MB limit.');
      }
      chunks.push(Buffer.from(chunk.value));
    }
    return await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
export async function handleShowcase(request: Request, action: string[]) {
  if (!(await showcaseAccess(request.headers)))
    return json({ error: 'Showcase unavailable.' }, 404);
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host'))
      return json({ error: 'Origin not permitted.' }, 403);
    if (action[0] === 'ask' || action[0] === 'topic')
      return json(
        {
          error: "I couldn't answer that right now. Your lesson is still here.",
          reason:
            'No qualified read-only model connector is available for showcase sessions. Existing tutor endpoints persist production conversations and academic state, so they are not used by this prototype.',
          available: false,
        },
        503,
      );
    if (action[0] !== 'upload') return json({ error: 'Unknown action.' }, 404);
    if (Number(request.headers.get('content-length')) > MAX_BYTES + 1024 * 1024)
      return json({ error: 'PDF exceeds the 20 MB limit.' }, 413);
    try {
      const form = await boundedForm(request);
      const file = form.get('file');
      if (!file || typeof file === 'string' || !('arrayBuffer' in file))
        return json({ error: 'Select a PDF file.' }, 400);
      if (file.size > MAX_BYTES)
        return json({ error: 'PDF exceeds the 20 MB limit.' }, 413);
      if (
        !file.name.toLowerCase().endsWith('.pdf') ||
        (file.type && file.type !== 'application/pdf')
      )
        return json({ error: 'Only PDF files are supported.' }, 400);
      const result = await extract(
        Buffer.from(await file.arrayBuffer()),
        request.signal,
      );
      return json({
        id: crypto.randomUUID(),
        filename: file.name.slice(0, 160),
        sha256: result.fileSha256,
        pageCount: result.pages.length,
        extractedPages: result.pages.filter((p) => p.trim()).length,
        recognized: recognize(result.fileSha256),
        pages: result.pages.map((text, i) => ({ page: i + 1, text })),
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : 'PDF extraction failed.',
        },
        422,
      );
    }
  }
  if (action[0] === 'asset') {
    const filename = action[1];
    if (action.length !== 2 || !filename || !RUNTIME_ASSETS.includes(filename))
      return json({ error: 'Unknown scene asset.' }, 404);
    const data = await readFile(
      join(root(), 'assets/realism/runtime', filename),
    );
    return new Response(data, {
      headers: {
        ...privateHeaders,
        'Cache-Control': 'private, max-age=86400',
        'Content-Type': filename.endsWith('.glb')
          ? 'model/gltf-binary'
          : 'image/vnd.radiance',
        'Content-Length': String(data.byteLength),
      },
    });
  }
  if (action[0] === 'capabilities')
    return json({
      model: false,
      voice: false,
      reason:
        'No isolated qualified provider. Prepared teaching and deterministic practice are available.',
    });
  if (action[0] === 'source') {
    const source = manifest.source_files.find((f) => f.filename === action[1]);
    if (!source) return json({ error: 'Unknown source.' }, 404);
    const data = await readFile(
      join(root(), 'assets/source-pdfs', source.filename),
    );
    if (createHash('sha256').update(data).digest('hex') !== source.sha256)
      return json({ error: 'Source integrity mismatch.' }, 409);
    return new Response(data, {
      headers: {
        ...privateHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${source.filename}"`,
      },
    });
  }
  if (action[0] === 'page') {
    const inventory = JSON.parse(
      await readFile(join(root(), 'assets/extracted-sources.json'), 'utf8'),
    );
    const source = inventory.find(
      (x: { filename: string }) => x.filename === action[1],
    );
    const page = source?.pages.find(
      (x: { page: number }) => x.page === Number(action[2]),
    );
    return page ? json(page) : json({ error: 'Page unavailable.' }, 404);
  }
  return json({ error: 'Unknown action.' }, 404);
}
