import { spawn, execFile } from 'node:child_process';
import { access, mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { KnowledgePdfProcess } from './knowledge-pdf-process';
import { parserRuntime, sha256, type ExtractionEvidence } from './adapters/content-adapter';
import { resolvePinnedOcrRuntime } from './petros-ocr-runtime';

const cropSchema = z
  .object({
    data: z.string().max(1_500_000),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().min(1).max(1280),
    height: z.number().int().min(1).max(1280),
    pixels: z
      .object({
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
/** OCR has no provider, credentials or external fetch. Scores are deliberately uncalibrated. */
async function legacyRuntime(binary: string) {
  const executable = await realpath(binary);
  if (!executable.startsWith('/opt/homebrew/Cellar/tesseract/'))
    throw new Error('M2_OCR_BINARY_UNQUALIFIED');
  const data = await realpath('/opt/homebrew/share/tessdata');
  await access(join(data, 'eng.traineddata'));
  const executableSha256 = sha256(await readFile(executable));
  const modelDataSha256 = sha256(await readFile(join(data, 'eng.traineddata')));
  const version = `tesseract.binary.${executableSha256.slice(0, 20)}.eng.${modelDataSha256.slice(0, 16)}`;
  const runtime = {
    executableSha256,
    modelDataSha256,
    packageVersion: executable.split('/Cellar/tesseract/')[1]!.split('/')[0]!,
    modelData: 'eng.traineddata' as const,
    segmentationMode: 11 as const,
  };
  return {
    executable,
    data,
    version,
    runtime,
    libraryRoots: ['/opt/homebrew/Cellar'],
    libraryFiles: [] as string[],
  };
}
async function localTesseract(png: Buffer, signal: AbortSignal, binary: string) {
  if (process.platform !== 'darwin') throw new Error('M2_OCR_SANDBOX_UNAVAILABLE');
  await access('/usr/bin/sandbox-exec');
  const manifest = process.env.PETROS_LOCAL_OCR_MANIFEST;
  const pin = process.env.PETROS_LOCAL_OCR_MANIFEST_SHA256;
  if (!!manifest !== !!pin) throw new Error('M2_OCR_RUNTIME_PIN_REQUIRED');
  const { executable, data, version, runtime, libraryRoots, libraryFiles } =
    manifest && pin ? await resolvePinnedOcrRuntime(manifest, pin) : await legacyRuntime(binary);
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'petros-ocr-'))),
    literal = (s: string) => JSON.stringify(s);
  const profile = `(version 1)(deny default)(allow sysctl-read)(allow mach-lookup)(allow file-read-metadata)
    (allow process-exec (literal ${literal(executable)})(literal "/bin/bash"))
    (allow file-read* (subpath "/System/Library")(subpath "/usr/lib")${libraryRoots.map((p) => `(subpath ${literal(p)})`).join('')}${libraryFiles.map((p) => `(literal ${literal(p)})`).join('')}(subpath ${literal(data)})(literal ${literal(executable)})
      (literal "/")(literal "/bin/bash")(literal "/dev/null")(literal "/dev/random")(literal "/dev/urandom"))
    (allow file-read* file-write* (subpath ${literal(directory)}))`;
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        '/usr/bin/sandbox-exec',
        [
          '-p',
          profile,
          '/bin/bash',
          '-c',
          'ulimit -t 3; exec "$@"',
          'petros-ocr',
          executable,
          'stdin',
          'stdout',
          '--tessdata-dir',
          data,
          '-l',
          'eng',
          '--psm',
          '11',
          'tsv',
        ],
        {
          cwd: directory,
          detached: true,
          env: { PATH: '/usr/bin:/bin', LANG: 'C', TMPDIR: directory, OMP_THREAD_LIMIT: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let output = '',
        bytes = 0,
        error: Error | undefined,
        checking = false;
      const kill = (code: string) => {
        error ??= new Error(code);
        try {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* already stopped */
        }
      };
      const abort = () => kill('M2_OCR_CANCELLED');
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const wall = setTimeout(() => kill('M2_OCR_TIMEOUT'), 5000),
        monitor = setInterval(() => {
          if (checking || !child.pid) return;
          checking = true;
          execFile(
            '/bin/ps',
            ['-o', 'rss=', '-p', String(child.pid)],
            { timeout: 500, maxBuffer: 1024 },
            (err, s) => {
              checking = false;
              if (err && child.exitCode === null && child.signalCode === null)
                kill('M2_OCR_MONITOR_FAILED');
              else if (Number(s.trim()) > 262144) kill('M2_OCR_MEMORY_LIMIT');
            },
          );
        }, 100);
      child.stdout.on('data', (b: Buffer) => {
        bytes += b.length;
        if (bytes > 500_000) kill('M2_OCR_OUTPUT_LIMIT');
        else output += b.toString('utf8');
      });
      child.stderr.on('data', (b: Buffer) => {
        bytes += b.length;
        if (bytes > 500_000) kill('M2_OCR_OUTPUT_LIMIT');
      });
      child.stdin.on('error', () => {});
      child.on('error', () => kill('M2_OCR_UNAVAILABLE'));
      child.on('close', (code) => {
        clearTimeout(wall);
        clearInterval(monitor);
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else if (code !== 0) reject(new Error('M2_OCR_FAILED'));
        else resolve(output);
      });
      child.stdin.end(png);
    });
    return { output, version, runtime };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
/** Regenerates an authentic raster crop without invoking OCR or a model. */
export async function extractSourceCrop(e: ExtractionEvidence, key: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const element = e.elements.find((x) => x.key === key && x.channel === 'visible');
  if (!element) throw new Error('M2_OCR_UNKNOWN_REGION');
  const locator = element.locator;
  const number =
    locator.kind === 'pdf' ? locator.page : locator.kind === 'slide' ? locator.slide : 0;
  const region =
    'region' in locator && locator.region ? locator.region : { x: 0, y: 0, width: 1, height: 1 };
  const surface = e.surfaces[number - 1];
  const image =
    element.sourceImage ??
    (surface?.preview?.kind === 'png' ? { data: surface.preview.data } : null);
  if (!image) return null;
  if (
    element.sourceImage &&
    sha256(Buffer.from(element.sourceImage.data, 'base64')) !== element.sourceImage.hash
  )
    throw new Error('M2_OCR_IMAGE_HASH');
  const runtime = parserRuntime();
  runtime.args.unshift('crop');
  const crop = await new KnowledgePdfProcess().run(
    Buffer.from(
      JSON.stringify({
        data: image.data,
        region: element.sourceImage ? { x: 0, y: 0, width: 1, height: 1 } : region,
      }),
    ),
    signal,
    () => {},
    join(__dirname, 'adapters/m2-crop.cjs'),
    { wallMs: 5000, rssKiB: 262144, outputBytes: 2_000_000 },
    cropSchema,
    runtime,
  );
  if (sha256(Buffer.from(crop.data, 'base64')) !== crop.hash) throw new Error('M2_OCR_CROP_HASH');
  return { crop, locator, region };
}
export async function extractSelectedOcr(
  e: ExtractionEvidence,
  keys: readonly string[],
  signal: AbortSignal,
  binary = '/opt/homebrew/bin/tesseract',
) {
  if (keys.length > 6 || new Set(keys).size !== keys.length) throw new Error('M2_OCR_REGION_LIMIT');
  const results = [];
  for (const key of keys) {
    if (!e.elements.some((x) => x.key === key && x.channel === 'visible'))
      throw new Error('M2_OCR_UNKNOWN_REGION');
    try {
      const sourceCrop = await extractSourceCrop(e, key, signal);
      if (!sourceCrop) {
        results.push({
          key,
          status: 'unsupported' as const,
          reason: 'Authentic raster crop unavailable; native SVG is not OCR evidence.',
        });
        continue;
      }
      const { crop, locator: l, region } = sourceCrop;
      const ocr = await localTesseract(Buffer.from(crop.data, 'base64'), signal, binary),
        labels = [];
      for (const line of ocr.output.split('\n').slice(1)) {
        const columns = line.split('\t');
        if (columns.length !== 12 || columns[0] !== '5' || !columns[11]?.trim()) continue;
        const [x, y, w, h] = columns.slice(6, 10).map(Number);
        if (
          ![x, y, w, h].every(Number.isFinite) ||
          x! < 0 ||
          y! < 0 ||
          w! <= 0 ||
          h! <= 0 ||
          x! + w! > crop.width ||
          y! + h! > crop.height
        )
          throw new Error('M2_OCR_GEOMETRY');
        labels.push({
          text: columns[11].slice(0, 120),
          pixels: { x: x!, y: y!, width: w!, height: h! },
          region: {
            x: x! / crop.width,
            y: y! / crop.height,
            width: w! / crop.width,
            height: h! / crop.height,
          },
        });
        if (labels.length > 100) throw new Error('M2_OCR_LABEL_LIMIT');
      }
      results.push({
        key,
        status: 'review_required' as const,
        sourceHash: e.originalHash,
        locator: l,
        region,
        crop,
        method: 'local_tesseract' as const,
        version: ocr.version,
        runtime: ocr.runtime,
        text: labels
          .map((x) => x.text)
          .join(' ')
          .slice(0, 8000),
        labels,
        confidence: null,
        reason:
          'OCR text is uncalibrated. Labels do not establish edges, equations or educational meaning.',
      });
    } catch (error) {
      signal.throwIfAborted();
      results.push({
        key,
        status: 'blocked' as const,
        reason: error instanceof Error ? error.message : 'M2_OCR_FAILED',
      });
    }
  }
  return results;
}
