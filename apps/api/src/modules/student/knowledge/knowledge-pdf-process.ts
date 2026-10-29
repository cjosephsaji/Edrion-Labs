import { spawn, execFile } from 'node:child_process';
import { realpath, mkdtemp, rm, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { Injectable } from '@nestjs/common';
import {
  PETROS_DOCUMENT_MAX_FILE_BYTES,
  petrosPdfWorkerResultSchema,
  type PetrosPdfWorkerResult,
} from '@edrion/schemas';

export class PdfPreparationError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

/** Hard wall/output/heap/CPU bounds, sampled RSS bound, and OS filesystem/network isolation. */
@Injectable()
export class KnowledgePdfProcess {
  async extract(
    buffer: Buffer,
    signal: AbortSignal,
    progress: (page: number) => void = () => {},
  ): Promise<PetrosPdfWorkerResult> {
    if (buffer.length > PETROS_DOCUMENT_MAX_FILE_BYTES)
      throw new PdfPreparationError('PETROS_DOCUMENT_LIMIT');
    return this.run(buffer, signal, progress);
  }

  // Separate seam also exercises hostile trusted-worker fixtures under the actual sandbox in tests.
  async run<T = PetrosPdfWorkerResult>(
    buffer: Buffer,
    signal: AbortSignal,
    progress: (page: number) => void,
    script = join(__dirname, 'pdf-extract.cjs'),
    limits: { wallMs: number; rssKiB: number; outputBytes: number; cpuSeconds?: number } = {
      wallMs: 20_000,
      rssKiB: 262_144,
      outputBytes: 16 * 1024 * 1024,
    },
    outputSchema: { parse(input: unknown): T } = petrosPdfWorkerResultSchema as unknown as {
      parse(input: unknown): T;
    },
    runtime: {
      readRoots?: string[];
      args?: string[];
      addons?: boolean;
      onMetrics?: (metrics: { wallMs: number; peakRssKiB: number; outputBytes: number; validationMs?:number;parseMs?:number;structuralMs?:number;selfPeakRssKiB?:number }) => void;
    } = {},
  ): Promise<T> {
    if (signal.aborted) throw new PdfPreparationError('PETROS_PREPARATION_CANCELLED');
    const node = await realpath(process.execPath);
    const require = createRequire(join(__dirname, 'pdf-extract.cjs'));
    const pdf = await realpath(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
    const worker = await realpath(script);
    const workDir = await realpath(await mkdtemp(join(tmpdir(), 'petros-pdf-')));
    try {
      const args = await sandboxCommand(
        node,
        worker,
        pdf,
        workDir,
        Math.max(1, Math.min(15, Math.floor(limits.cpuSeconds ?? 15))),
        runtime,
      ).catch(() => {
        throw new PdfPreparationError('PETROS_SANDBOX_UNAVAILABLE', true);
      });
      return await new Promise((resolve, reject) => {
        const child = spawn(args[0]!, args.slice(1), {
          cwd: workDir,
          detached: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          // No inherited credentials, NODE_OPTIONS, package hooks, HOME, proxy or app config.
          env: { PATH: '/usr/bin:/bin', LANG: 'C', TMPDIR: workDir },
        });
        let error: PdfPreparationError | undefined;
        let output = '';
        let bytes = 0;
        let result: T | undefined;
        let checking = false;
        let peakRssKiB = 0;
        let nativeMetrics: {validationMs:number;parseMs:number;structuralMs:number;selfPeakRssKiB:number} | undefined;
        const began = performance.now();
        const kill = (code: string, retryable = false) => {
          error ??= new PdfPreparationError(code, retryable);
          try {
            if (child.pid) process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* already exited */
          }
        };
        const abort = () => kill('PETROS_PREPARATION_CANCELLED');
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        const timeout = setTimeout(() => kill('PETROS_PDF_TIMEOUT'), limits.wallMs);
        const monitor = setInterval(() => {
          if (checking || !child.pid) return;
          checking = true;
          execFile(
            '/bin/ps',
            ['-axo', 'pid=,ppid=,rss='],
            { timeout: 500, maxBuffer: 1024 * 1024 },
            (err, stdout) => {
              checking = false;
              if (!err) peakRssKiB = Math.max(peakRssKiB, processTreeRss(stdout, child.pid!));
              if (!err && peakRssKiB > limits.rssKiB) kill('PETROS_PDF_MEMORY_LIMIT');
              else if (err && child.exitCode === null && child.signalCode === null)
                kill('PETROS_PDF_MONITOR_FAILED', true);
            },
          );
        }, 100);
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > limits.outputBytes) return kill('PETROS_PDF_OUTPUT_LIMIT');
          output += chunk;
          let newline: number;
          while ((newline = output.indexOf('\n')) >= 0) {
            const line = output.slice(0, newline);
            output = output.slice(newline + 1);
            try {
              const value = JSON.parse(line);
              if (value.nativeMetrics && !nativeMetrics && Object.keys(value).length===1 &&
                Object.keys(value.nativeMetrics).sort().join(',')==='parseMs,selfPeakRssKiB,structuralMs,validationMs' &&
                Object.entries(value.nativeMetrics).every(([key,n])=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=(key==='selfPeakRssKiB'?limits.rssKiB:limits.wallMs)))
                nativeMetrics=value.nativeMetrics;
              else if (Number.isInteger(value.progress) && value.progress >= 1 && value.progress <= 500)
                progress(value.progress);
              else if (
                typeof value.error === 'string' &&
                /^PETROS_(DOCUMENT_LIMIT|PDF_INVALID|PDF_ENCRYPTED|M2_[A-Z_]+)$/.test(value.error)
              )
                error = new PdfPreparationError(value.error);
              else if (value.result && !result) result = outputSchema.parse(value.result);
              else kill('PETROS_PDF_PROTOCOL_INVALID');
            } catch {
              kill('PETROS_PDF_PROTOCOL_INVALID');
            }
          }
        });
        child.stderr.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > limits.outputBytes) kill('PETROS_PDF_OUTPUT_LIMIT');
        });
        child.stdin.on('error', () => {}); // EPIPE is reported by the child's terminal result.
        child.on('error', () => {
          error = new PdfPreparationError('PETROS_SANDBOX_UNAVAILABLE', true);
        });
        child.on('close', (code, stoppedBy) => {
          clearTimeout(timeout);
          clearInterval(monitor);
          signal.removeEventListener('abort', abort);
          try {
            runtime.onMetrics?.({
              wallMs: performance.now() - began,
              peakRssKiB,
              outputBytes: bytes,
              ...nativeMetrics,
            });
          } catch {
            /* An optional telemetry observer cannot prevent cleanup or settle the parser result. */
          }
          if (error) reject(error);
          else if (stoppedBy === 'SIGXCPU' || stoppedBy === 'SIGKILL')
            reject(new PdfPreparationError('PETROS_PDF_PROCESS_LIMIT'));
          else if (code !== 0 || stoppedBy || !result || output.trim())
            reject(new PdfPreparationError('PETROS_PDF_PROCESS_FAILED', true));
          else resolve(result);
        });
        child.stdin.end(buffer);
      });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

async function sandboxCommand(
  node: string,
  worker: string,
  pdf: string,
  workDir: string,
  cpuSeconds: number,
  runtime: { readRoots?: string[]; args?: string[]; addons?: boolean },
): Promise<string[]> {
  const pdfRoot = dirname(dirname(dirname(pdf)));
  const nodeArgs = [
    node,
    '--max-old-space-size=128',
    '--openssl-config=/dev/null',
    ...(runtime.addons ? ['--allow-addons'] : ['--no-addons']),
    process.allowedNodeEnvironmentFlags.has('--permission')
      ? '--permission'
      : '--experimental-permission',
    `--allow-fs-read=${worker}`,
    `--allow-fs-read=${pdfRoot}`,
    ...(runtime.readRoots ?? []).map((path) => `--allow-fs-read=${path}`),
    worker,
    pdf,
    ...(runtime.args ?? []),
  ];
  if (process.platform === 'darwin') {
    await access('/usr/bin/sandbox-exec');
    const literal = (path: string) => JSON.stringify(path);
    // Library installation roots contain runtime libraries only, never app source or storage.
    const runtimeRoots = [
      '/System/Library',
      '/usr/lib',
      '/opt/homebrew/Cellar',
      '/opt/homebrew/opt',
    ];
    const profile = `(version 1) (deny default)
      (allow process-exec (literal ${literal(node)}) (literal "/bin/bash"))
      (allow sysctl-read) (allow mach-lookup)
      (allow file-read-metadata)
      (allow file-read* ${runtimeRoots.map((p) => `(subpath ${literal(p)})`).join(' ')}
        ${(runtime.readRoots ?? []).map((p) => `(subpath ${literal(p)})`).join(' ')}
        (subpath ${literal(pdfRoot)}) (literal ${literal(worker)})
        (literal "/") (literal "/bin/bash") (literal ${literal(node)}) (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))
      (allow file-read* file-write* (subpath ${literal(workDir)}))`;
    return [
      '/usr/bin/sandbox-exec',
      '-p',
      profile,
      '/bin/bash',
      '-c',
      `ulimit -t ${cpuSeconds}; exec "$@"`,
      'petros-pdf',
      ...nodeArgs,
    ];
  }
  if (process.platform === 'linux') {
    // Installed by the deployment image, not downloaded or silently replaced at runtime.
    await Promise.all([access('/usr/bin/bwrap'), access('/usr/bin/prlimit')]);
    const roots = [
      '/usr',
      '/lib',
      '/lib64',
      dirname(dirname(node)),
      pdfRoot,
      ...(runtime.readRoots ?? []),
    ];
    const mounts: string[] = [];
    for (const path of [...new Set(roots)]) {
      try {
        await access(path);
        mounts.push('--ro-bind', path, path);
      } catch {
        /* optional lib64 */
      }
    }
    return [
      '/usr/bin/bwrap',
      '--unshare-all',
      '--die-with-parent',
      '--new-session',
      ...mounts,
      '--ro-bind',
      worker,
      worker,
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      '--tmpfs',
      '/tmp',
      '--chdir',
      '/tmp',
      '--cap-drop',
      'ALL',
      '/usr/bin/prlimit',
      `--cpu=${cpuSeconds}:${cpuSeconds}`,
      '--nproc=32:32',
      '--fsize=0:0',
      '--',
      ...nodeArgs,
    ];
  }
  throw new PdfPreparationError('PETROS_SANDBOX_UNAVAILABLE', true);
}

/** Include namespace/sandbox descendants, not only the Linux bwrap supervisor. */
function processTreeRss(output: string, root: number): number {
  const rows = output
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const children = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parent] of rows)
      if (pid && parent && children.has(parent) && !children.has(pid)) {
        children.add(pid);
        changed = true;
      }
  }
  return rows.reduce((sum, [pid, , rss]) => sum + (pid && children.has(pid) ? (rss ?? 0) : 0), 0);
}
