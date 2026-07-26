import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ApiEnv } from '@edrion/config';

/** Local-disk object storage driver for student uploads. */
export class LocalDiskDriver {
  private readonly root: string;

  constructor(env: ApiEnv) {
    this.root = resolve(env.STUDENT_STORAGE_DIR);
  }

  async put(scopeKey: string, buffer: Buffer): Promise<string> {
    const key = join(scopeKey, `${randomUUID()}.bin`);
    const abs = this.absolute(key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return key;
  }

  stream(key: string): ReadStream {
    return createReadStream(this.absolute(key));
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.absolute(key));
  }

  async size(key: string): Promise<number> {
    return (await stat(this.absolute(key))).size;
  }

  async remove(key: string): Promise<void> {
    await unlink(this.absolute(key)).catch(() => undefined);
  }

  /** Absolute filesystem path for a storage key (used by PDF ingest worker). */
  resolvePath(key: string): string {
    return this.absolute(key);
  }

  private absolute(key: string): string {
    const abs = resolve(this.root, key);
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return abs;
  }
}
