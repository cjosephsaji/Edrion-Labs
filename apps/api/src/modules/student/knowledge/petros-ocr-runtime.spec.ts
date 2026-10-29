import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from './adapters/content-adapter';
import { resolvePinnedOcrRuntime } from './petros-ocr-runtime';
import { extractSelectedOcr } from './petros-content-ocr';
import { PdfContentAdapter } from './adapters/pdf-content.adapter';
import { KnowledgePdfProcess } from './knowledge-pdf-process';
import { selectVisualRegions } from './petros-content-intelligence.service';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture(script = '#!/bin/bash\nexit 0\n') {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'petros-ocr-runtime-test-')));
  directories.push(directory);
  const prefix = join(directory, 'runtime');
  for (const part of ['bin', 'lib', 'share/tessdata'])
    await mkdir(join(prefix, part), { recursive: true });
  const executable = join(prefix, 'bin/tesseract'),
    model = join(prefix, 'share/tessdata/eng.traineddata');
  await writeFile(executable, script, { mode: 0o700 });
  await writeFile(model, 'synthetic model for configuration/sandbox probes only');
  await writeFile(join(prefix, 'lib/test.dylib'), 'synthetic library; never loaded');
  const manifest = {
    schemaVersion: 'petros.local-ocr-runtime.v1',
    prefix,
    packageVersion: 'sandbox-test',
    executableSha256: sha256(Buffer.from(script)),
    modelDataSha256: sha256(readFileSync(model)),
    libraries: [
      { path: 'lib/test.dylib', sha256: sha256(Buffer.from('synthetic library; never loaded')) },
    ],
  };
  const path = join(directory, 'manifest.json');
  const save = async () => {
    const data = JSON.stringify(manifest);
    await writeFile(path, data);
    return sha256(Buffer.from(data));
  };
  return { directory, prefix, executable, model, manifest, path, save, pin: await save() };
}

describe('explicit pinned OCR runtime admission', () => {
  it('rejects a changed manifest before accepting its executable paths', async () => {
    const f = await fixture();
    await writeFile(f.path, '{}');
    await expect(resolvePinnedOcrRuntime(f.path, f.pin)).rejects.toThrow('MANIFEST_HASH');
  });
  it.each(['bin/tesseract', 'share/tessdata/eng.traineddata', 'lib/test.dylib'])(
    'rejects a changed pinned %s',
    async (part) => {
      const f = await fixture();
      await writeFile(join(f.prefix, part), 'changed');
      await expect(resolvePinnedOcrRuntime(f.path, f.pin)).rejects.toThrow(
        /ASSET_HASH|LIBRARY_HASH/,
      );
    },
  );
  it('rejects an escaping model symlink and unpinned private dylibs', async () => {
    const f = await fixture();
    await writeFile(join(f.prefix, 'lib/new.dylib'), 'unlisted');
    await expect(resolvePinnedOcrRuntime(f.path, f.pin)).rejects.toThrow('UNPINNED_LIBRARY');
    await rm(join(f.prefix, 'lib/new.dylib'));
    const outside = join(f.directory, 'outside');
    await writeFile(outside, readFileSync(f.model));
    await rm(f.model);
    await symlink(outside, f.model);
    await expect(resolvePinnedOcrRuntime(f.path, f.pin)).rejects.toThrow('PATH_ESCAPE');
  });
  it('does not admit traversal, duplicate library aliases, or a missing configuration pin', async () => {
    const f = await fixture();
    f.manifest.libraries.push({ ...f.manifest.libraries[0]! });
    await expect(resolvePinnedOcrRuntime(f.path, await f.save())).rejects.toThrow('LIBRARY_PATH');
    f.manifest.libraries = [{ path: 'lib/../bin/fake.dylib', sha256: 'a'.repeat(64) }];
    await expect(resolvePinnedOcrRuntime(f.path, await f.save())).rejects.toThrow();
    await expect(resolvePinnedOcrRuntime(f.path, '')).rejects.toThrow('PIN_REQUIRED');
  });
});

it('keeps the configured runtime network-denied, outside-file-denied and credential-free in the actual macOS sandbox', async () => {
  let connections = 0;
  const server = createServer((socket) => {
    connections++;
    socket.destroy();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Listener missing');
    const f = await fixture();
    const secret = join(f.directory, 'outside-secret');
    await writeFile(secret, 'synthetic secret, never a real credential');
    // A native probe exercises the same OS boundary as the real engine. It is
    // synthetic trusted test code, never an OCR or educational-quality receipt.
    const source = join(f.directory, 'sandbox-probe.c');
    await writeFile(
      source,
      `
#include <stdio.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
int main(void) {
  FILE *file = fopen(${JSON.stringify(secret)}, "r");
  int disk = file != NULL;
  if (file) fclose(file);
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in addr = {0};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(${address.port});
  addr.sin_addr.s_addr = htonl(0x7f000001);
  int network = fd >= 0 && connect(fd, (struct sockaddr *)&addr, sizeof(addr)) == 0;
  if (fd >= 0) close(fd);
  printf("level\\tpage_num\\tblock_num\\tpar_num\\tline_num\\tword_num\\tleft\\ttop\\twidth\\theight\\tconf\\ttext\\n5\\t1\\t1\\t1\\t1\\t1\\t1\\t1\\t2\\t2\\t0\\t%s %s %s\\n",
    disk ? "disk-leak" : "disk-denied", network ? "network-leak" : "network-denied",
    getenv("PETROS_OCR_TEST_SENTINEL") ? "env-leak" : "env-denied");
  return 0;
}
`,
    );
    execFileSync('/usr/bin/clang', [source, '-o', f.executable], { timeout: 10000, stdio: 'pipe' });
    f.manifest.executableSha256 = sha256(readFileSync(f.executable));
    vi.stubEnv('PETROS_LOCAL_OCR_MANIFEST', f.path);
    vi.stubEnv('PETROS_LOCAL_OCR_MANIFEST_SHA256', await f.save());
    vi.stubEnv('PETROS_OCR_TEST_SENTINEL', 'synthetic environment sentinel');
    const e = await new PdfContentAdapter(new KnowledgePdfProcess()).extract(
      readFileSync(
        resolve(
          __dirname,
          '../../../../../../packages/learn-evals/src/petros-v2/fixtures/sources/image-only.pdf',
        ),
      ),
      new AbortController().signal,
    );
    const result = await extractSelectedOcr(
      e,
      selectVisualRegions(e)
        .slice(0, 1)
        .map((r) => r.key),
      new AbortController().signal,
    );
    expect(result[0]?.status, JSON.stringify(result)).toBe('review_required');
    if (result[0]?.status !== 'review_required') throw Error(JSON.stringify(result));
    expect(result[0].text).toBe('disk-denied network-denied env-denied');
    expect(connections).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 20000);
