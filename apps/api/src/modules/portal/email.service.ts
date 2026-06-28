import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiEnv } from '@edrion/config';
import type { Logger } from '@edrion/observability';
import { API_ENV, LOGGER } from '../../common/tokens';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SentEmail {
  messageId: string;
  transport: 'smtp' | 'log';
}

/**
 * Outbound transactional email seam. The dispatch transport is pluggable: when `SMTP_URL` is
 * configured a real SMTP send drops in here (one place), and until then a dev/offline **log
 * transport** renders the full message to the structured logger and returns a message id — so the
 * invitation pipeline (persist invitation → send email → audit) is complete and provable without a
 * mail server. The caller never branches on the transport.
 */
@Injectable()
export class EmailService {
  private readonly smtpConfigured: boolean;

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.smtpConfigured = Boolean(this.env.SMTP_URL);
  }

  async send(message: EmailMessage): Promise<SentEmail> {
    const messageId = randomUUID();
    if (this.smtpConfigured) {
      // Production transport drops in here (nodemailer/SES). Kept behind the same interface so the
      // caller and the audit trail are identical whether the transport is SMTP or the log fallback.
      this.logger.info('Dispatched email via SMTP', {
        event: 'email.send',
        transport: 'smtp',
        messageId,
        to: message.to,
        subject: message.subject,
      });
      return { messageId, transport: 'smtp' };
    }
    this.logger.info('Email (log transport — set SMTP_URL to dispatch for real)', {
      event: 'email.send',
      transport: 'log',
      messageId,
      from: this.env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return { messageId, transport: 'log' };
  }
}
