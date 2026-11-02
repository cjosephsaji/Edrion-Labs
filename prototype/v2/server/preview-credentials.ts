import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(pbkdf2);
const iterations = 600_000;
const format = /^pbkdf2-sha256:600000:([a-f0-9]{32}):([a-f0-9]{64})$/;
export const validPasswordHash = (hash: string) => format.test(hash);

export async function hashPreviewPassword(password: string) {
  if (password.length < 12 || password.length > 256)
    throw Error('Preview passwords must contain 12–256 characters.');
  const salt = randomBytes(16);
  const hash = await derive(password, salt, iterations, 32, 'sha256');
  return `pbkdf2-sha256:${iterations}:${salt.toString('hex')}:${hash.toString('hex')}`;
}
export async function verifyPreviewPassword(password: string, encoded: string) {
  const match = format.exec(encoded);
  if (!match || password.length > 256) return false;
  const hash = await derive(
    password,
    Buffer.from(match[1], 'hex'),
    iterations,
    32,
    'sha256',
  );
  return timingSafeEqual(hash, Buffer.from(match[2], 'hex'));
}
