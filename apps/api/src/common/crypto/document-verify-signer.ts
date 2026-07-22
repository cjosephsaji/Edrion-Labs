import { createHmac } from 'node:crypto';
import { VERIFY_CODE_ALPHABET, VERIFY_CODE_LENGTH } from '@edrion/schemas';

/**
 * Dedicated document verification short-code signer.
 * Never reuse SESSION_COOKIE_SECRET — callers must pass DOCUMENT_VERIFY_SECRET.
 *
 * v1: base32(HMAC-SHA256(secret, 'v1:'+vaultId)).slice(0, 12) over [A-HJ-NP-Z2-9]
 */
export const DOCUMENT_VERIFY_CODE_VERSION = 1 as const;

export function mintDocumentVerifyCode(vaultId: string, secret: string, version = DOCUMENT_VERIFY_CODE_VERSION): string {
  const material = version === 1 ? `v1:${vaultId}` : vaultId;
  const digest = createHmac('sha256', secret).update(material, 'utf8').digest();
  return toBase32Alphabet(digest).slice(0, VERIFY_CODE_LENGTH);
}

/** Normalize user input: uppercase, strip separators, reject illegal alphabet. */
export function normalizeVerifyCodeInput(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[\s-_]/g, '');
  if (cleaned === 'SAMPLE0000' || cleaned === 'SAMPLE-0000') return null;
  if (cleaned.length !== VERIFY_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!VERIFY_CODE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

function toBase32Alphabet(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += VERIFY_CODE_ALPHABET[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += VERIFY_CODE_ALPHABET[(value << (5 - bits)) & 31]!;
  }
  return out;
}
