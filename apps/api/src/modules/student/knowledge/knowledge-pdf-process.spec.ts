import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgePdfProcess } from './knowledge-pdf-process';

const directory = mkdtempSync(join(tmpdir(), 'petros-sandbox-test-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const worker = new KnowledgePdfProcess();
function fixture(code: string) {
  const path = join(directory, `test-${Math.random()}.cjs`);
  writeFileSync(path, code);
  return path;
}

describe('restricted PDF process (real OS sandbox)', () => {
  it('denies credentials, foreign file reads, writes, subprocesses and network access', async () => {
    const forbidden = join(directory, 'private.txt');
    writeFileSync(forbidden, 'test-only-private-value');
    const script = fixture(`
      const fs = require('node:fs'); const cp = require('node:child_process');
      const checks = [];
      checks.push(!process.env.DATABASE_URL && !process.env.HOME && !process.env.NODE_OPTIONS);
      try { fs.readFileSync(${JSON.stringify(forbidden)}); checks.push(false); } catch { checks.push(true); }
      try { fs.writeFileSync(${JSON.stringify(forbidden)}, 'oops'); checks.push(false); } catch { checks.push(true); }
      try { cp.execFileSync('/bin/echo', ['escape']); checks.push(false); } catch { checks.push(true); }
      const socket = require('node:net').connect({ host: '127.0.0.1', port: 9 });
      socket.on('error', e => { checks.push(['EPERM', 'EACCES', 'ERR_ACCESS_DENIED'].includes(e.code));
        console.log(JSON.stringify({result: {pages: [JSON.stringify(checks)], fileSha256:'a'.repeat(64)}})); });
    `);
    const result = await worker.run(
      Buffer.alloc(0),
      new AbortController().signal,
      () => {},
      script,
    );
    expect(JSON.parse(result.pages[0]!)).toEqual([true, true, true, true, true]);
  });

  it('kills a stalled process at the wall deadline', async () => {
    await expect(
      worker.run(
        Buffer.alloc(0),
        new AbortController().signal,
        () => {},
        fixture('setInterval(() => {}, 1000)'),
        { wallMs: 500, rssKiB: 262144, outputBytes: 1024 },
      ),
    ).rejects.toMatchObject({ code: 'PETROS_PDF_TIMEOUT' });
  });
  it('kills excessive output and resident memory', async () => {
    await expect(
      worker.run(
        Buffer.alloc(0),
        new AbortController().signal,
        () => {},
        fixture("process.stdout.write('x'.repeat(10000)); setInterval(() => {}, 1000)"),
        { wallMs: 3000, rssKiB: 262144, outputBytes: 1024 },
      ),
    ).rejects.toMatchObject({ code: 'PETROS_PDF_OUTPUT_LIMIT' });
    await expect(
      worker.run(
        Buffer.alloc(0),
        new AbortController().signal,
        () => {},
        fixture('setInterval(() => {}, 1000)'),
        { wallMs: 3000, rssKiB: 1, outputBytes: 1024 },
      ),
    ).rejects.toMatchObject({ code: 'PETROS_PDF_MEMORY_LIMIT' });
  });
  it('enforces the OS CPU budget independently of the wall deadline', async () => {
    await expect(
      worker.run(
        Buffer.alloc(0),
        new AbortController().signal,
        () => {},
        fixture('while (true) {}'),
        { wallMs: 5000, rssKiB: 262144, outputBytes: 1024, cpuSeconds: 1 },
      ),
    ).rejects.toMatchObject({ code: 'PETROS_PDF_PROCESS_LIMIT', retryable: false });
  });
  it('cancels an executing process', async () => {
    const cancel = new AbortController();
    const pending = worker.run(
      Buffer.alloc(0),
      cancel.signal,
      () => {},
      fixture('setInterval(() => {}, 1000)'),
    );
    setTimeout(() => cancel.abort(), 300);
    await expect(pending).rejects.toMatchObject({ code: 'PETROS_PREPARATION_CANCELLED' });
  });
  it('rejects malformed PDF input without exposing parser details', async () => {
    await expect(
      worker.extract(Buffer.from('not a PDF'), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PETROS_PDF_INVALID' });
  });
});
