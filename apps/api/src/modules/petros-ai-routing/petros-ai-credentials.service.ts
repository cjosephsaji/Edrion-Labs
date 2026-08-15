import { BadRequestException, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

interface CredentialEnvelope {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

/** Server-only AES-GCM credential vault seam. Plaintext credentials never enter API DTOs. */
@Injectable()
export class PetrosAiCredentialsService {
  private key(): Buffer {
    const raw = process.env.PETROS_CREDENTIAL_ENCRYPTION_KEY;
    if (!raw && process.env.NODE_ENV === 'production') {
      throw new BadRequestException({
        code: 'PETROS_CREDENTIAL_KEY_MISSING',
        message: 'PETROS_CREDENTIAL_ENCRYPTION_KEY must be configured before storing credentials.',
      });
    }
    return createHash('sha256').update(raw ?? 'edrion-dev-petros-credentials-change-me').digest();
  }

  encrypt(secret: string): { envelope: string; hint: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const payload: CredentialEnvelope = {
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    };
    return { envelope: JSON.stringify(payload), hint: `••••${secret.slice(-4)}` };
  }

  decrypt(raw: string): string {
    try {
      const envelope = JSON.parse(raw) as CredentialEnvelope;
      if (envelope.v !== 1) throw new Error('unsupported credential envelope');
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(envelope.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new BadRequestException({
        code: 'PETROS_CREDENTIAL_DECRYPT_FAILED',
        message: 'The provider credential could not be decrypted. Rotate it before using this provider.',
      });
    }
  }
}
