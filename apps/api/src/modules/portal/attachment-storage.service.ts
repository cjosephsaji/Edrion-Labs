import { Inject, Injectable } from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';

/**
 * Local-disk attachment storage. A REAL store — bytes are written to and streamed from disk — kept
 * behind this small interface so it can be swapped for S3 / Supabase Storage later without touching
 * callers. Keys are institution-scoped and opaque; reads re-validate the key so a crafted key can
 * never escape the storage root (path-traversal guard).
 */
@Injectable()
export class AttachmentStorageService {
  private readonly root: string;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    this.root = resolve(env.ATTACHMENT_STORAGE_DIR);
  }

  /** Ceiling for a single uploaded file (bytes). */
  get maxBytes(): number {
    return this.env.ATTACHMENT_MAX_BYTES;
  }

  /** Persist a buffer under the institution, returning the opaque storage key (relative path). */
  async save(institutionId: string, buffer: Buffer): Promise<string> {
    const key = join(institutionId, `${randomUUID()}.bin`);
    const abs = this.absolute(key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return key;
  }

  stream(key: string): ReadStream {
    return createReadStream(this.absolute(key));
  }

  async size(key: string): Promise<number> {
    return (await stat(this.absolute(key))).size;
  }

  async remove(key: string): Promise<void> {
    await unlink(this.absolute(key)).catch(() => undefined);
  }

  /** Resolve a key under the root, refusing anything that escapes it. */
  private absolute(key: string): string {
    const abs = resolve(this.root, key);
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return abs;
  }
}
