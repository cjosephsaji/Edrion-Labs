import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Dedicated document verify code (v1). Not the session/cookie secret. */
export function mintDocumentVerifyCode(
  vaultId: string,
  secret = process.env.DOCUMENT_VERIFY_SECRET ?? process.env.COOKIE_SECRET ?? 'dev-document-verify',
): { code: string; version: 1 } {
  const digest = createHmac('sha256', secret).update(`v1:${vaultId}`).digest();
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += ALPHABET[digest[i]! % ALPHABET.length];
  }
  return { code, version: 1 };
}

export function normalizeVerifyCodeInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function sampleVerifyPlaceholder(): string {
  return 'SAMPLE000000';
}

export function randomVaultIdForSample(): string {
  return randomBytes(16).toString('hex');
}
