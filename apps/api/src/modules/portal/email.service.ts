import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createTransport, type Transporter } from 'nodemailer';
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
  private readonly transporter: Transporter | null;

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    // Build the SMTP transport once from SMTP_URL. When unset, transporter stays null and `send`
    // falls back to the dev/offline log transport — the caller and audit trail are identical either way.
    this.transporter = this.env.SMTP_URL ? createTransport(this.env.SMTP_URL) : null;
  }

  async send(message: EmailMessage): Promise<SentEmail> {
    if (this.transporter) {
      const info = await this.transporter.sendMail({
        from: this.env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      this.logger.info('Dispatched email via SMTP', {
        event: 'email.send',
        transport: 'smtp',
        messageId: info.messageId,
        to: message.to,
        subject: message.subject,
      });
      return { messageId: info.messageId, transport: 'smtp' };
    }
    const messageId = randomUUID();
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
