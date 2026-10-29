import { Injectable } from '@nestjs/common';
import {
  emailButton,
  emailCodeBlock,
  emailLayout,
  emailReferenceBlock,
  escapeHtml,
} from '../../common/email-templates';
import { EmailService, type SentEmail } from '../portal/email.service';

/**
 * Branded transactional emails for the registration funnel. Templates are plain functions that
 * return `{subject,text,html}` and dispatch through the shared {@link EmailService} seam (real SMTP
 * when configured, structured-log transport otherwise).
 */

const REGISTRATION_FOOTER =
  "You're receiving this because an institution registration was started with this email at Edrion. If this wasn't you, you can safely ignore it.";

@Injectable()
export class RegistrationEmailService {
  constructor(private readonly email: EmailService) {}

  sendOtp(to: string, code: string): Promise<SentEmail> {
    const text = `Your Edrion verification code is ${code}. It expires in 10 minutes. Do not share it with anyone.`;
    const html = emailLayout({
      heading: 'Verify your email',
      preheader: 'Your Edrion verification code',
      footer: REGISTRATION_FOOTER,
      bodyHtml: `<p style="margin:0 0 18px;">Use the code below to verify your email and continue your institution registration. It expires in <strong>10 minutes</strong>.</p>
        ${emailCodeBlock(code)}
        <p style="margin:0;">For your security, never share this code. Edrion staff will never ask you for it.</p>`,
    });
    return this.email.send({ to, subject: `Your Edrion verification code: ${code}`, text, html });
  }

  sendReviewStarted(to: string, displayName: string, publicRef: string): Promise<SentEmail> {
    const text = `Our onboarding team has started reviewing your Edrion application for ${displayName}. Reference: ${publicRef}. We'll email you once the review is complete — no action is needed from you right now.`;
    const html = emailLayout({
      heading: 'Your application is under review',
      preheader: `Reference ${publicRef}`,
      footer: REGISTRATION_FOOTER,
      bodyHtml: `<p style="margin:0 0 16px;">Our onboarding team has started reviewing the registration for <strong>${displayName}</strong>.</p>
        <p style="margin:0 0 8px;">Your reference number:</p>
        ${emailReferenceBlock(publicRef)}
        <p style="margin:0;">We'll email you once the review is complete. No action is needed from you right now.</p>`,
    });
    return this.email.send({
      to,
      subject: `Your Edrion application is under review (${publicRef})`,
      text,
      html,
    });
  }

  sendSubmitted(to: string, displayName: string, publicRef: string): Promise<SentEmail> {
    const text = `Thank you — your registration for ${displayName} has been received. Reference: ${publicRef}. Our onboarding team will review it and email you with the outcome.`;
    const html = emailLayout({
      heading: 'Application received',
      preheader: `Reference ${publicRef}`,
      footer: REGISTRATION_FOOTER,
      bodyHtml: `<p style="margin:0 0 16px;">Thank you for your interest in Edrion. We've received the registration for <strong>${displayName}</strong>.</p>
        <p style="margin:0 0 8px;">Your reference number:</p>
        ${emailReferenceBlock(publicRef)}
        <p style="margin:0;">Our onboarding team will review your request and email you once the review is complete. No action is needed from you right now.</p>`,
    });
    return this.email.send({
      to,
      subject: `We've received your Edrion application (${publicRef})`,
      text,
      html,
    });
  }

  sendApproved(to: string, displayName: string, existingAdministrator = false): Promise<SentEmail> {
    const accessNote = existingAdministrator
      ? 'Your nominated administrator already has an Edrion account and will receive sign-in details for this institution.'
      : 'Your administrator will receive a separate invitation email to set up access and begin onboarding.';
    const text = `Great news — the registration for ${displayName} has been approved. ${accessNote}`;
    const html = emailLayout({
      heading: 'Your application is approved 🎉',
      preheader: escapeHtml(`${displayName} is approved`),
      footer: REGISTRATION_FOOTER,
      bodyHtml: `<p style="margin:0 0 16px;">The registration for <strong>${escapeHtml(displayName)}</strong> has been approved.</p>
        <p style="margin:0;">${accessNote}</p>`,
    });
    return this.email.send({
      to,
      subject: `${displayName} has been approved on Edrion`,
      text,
      html,
    });
  }

  /** Only used when approval adds another institution to an already active institution account. */
  sendExistingAccountApproved(
    to: string,
    fullName: string,
    displayName: string,
    loginUrl: string,
    hasNativePassword = true,
  ): Promise<SentEmail> {
    const signInNote = hasNativePassword
      ? `Sign in with your current email (${to}) and password.`
      : 'Sign in using your existing Edrion sign-in method.';
    const text = `Hi ${fullName}, your new institution ${displayName} has been approved on Edrion and linked to your existing account. ${signInNote} No account activation or new password is needed. Sign in at ${loginUrl}, then choose ${displayName} to start onboarding. You can switch institutions beside Sign out.`;
    const html = emailLayout({
      heading: 'Your new institution is approved',
      preheader: escapeHtml(`${displayName} is ready to access with your existing account`),
      footer: REGISTRATION_FOOTER,
      bodyHtml: `<p style="margin:0 0 16px;">Hi ${escapeHtml(fullName)}, your new institution <strong>${escapeHtml(displayName)}</strong> has been approved on Edrion and linked to your existing account.</p>
        <p style="margin:0 0 16px;">${escapeHtml(signInNote)} No account activation or new password is needed.</p>
        <p style="margin:0 0 18px;">After signing in, choose <strong>${escapeHtml(displayName)}</strong> to start onboarding. You can switch institutions beside <strong>Sign out</strong>.</p>
        ${emailButton(escapeHtml(loginUrl), 'Sign in to Edrion')}`,
    });
    return this.email.send({
      to,
      subject: `${displayName} has been approved on Edrion`,
      text,
      html,
    });
  }

  sendRejected(to: string, displayName: string, reason: string): Promise<SentEmail> {
    const text = `Thank you for your interest in Edrion. After review, we're unable to approve the registration for ${displayName} at this time. Reason: ${reason}. You're welcome to reply to this email if you'd like to discuss further.`;
    const html = emailLayout({
      heading: 'Update on your application',
      preheader: `Decision on ${displayName}`,
      footer: REGISTRATION_FOOTER,
      bodyHtml: `<p style="margin:0 0 16px;">Thank you for your interest in Edrion and for taking the time to apply for <strong>${displayName}</strong>.</p>
        <p style="margin:0 0 8px;">After careful review, we're unable to approve this registration at this time.</p>
        <div style="margin:0 0 18px;background:#E7F0EA;border-radius:12px;padding:14px 18px;color:#1C2B24;">${reason}</div>
        <p style="margin:0;">If you believe this was in error or your circumstances change, simply reply to this email — we're happy to help.</p>`,
    });
    return this.email.send({
      to,
      subject: `Update on your Edrion application for ${displayName}`,
      text,
      html,
    });
  }

  sendAdminInvitation(
    to: string,
    fullName: string,
    displayName: string,
    loginUrl: string,
    temporaryPassword?: string,
  ): Promise<SentEmail> {
    const credLine = temporaryPassword
      ? `Sign in at ${loginUrl} with this email and the temporary password: ${temporaryPassword} (you'll be asked to change it).`
      : `Activate your account and set your password here: ${loginUrl}`;
    const text = `Hi ${fullName}, you've been set up as the administrator for ${displayName} on Edrion. ${credLine}`;
    const credHtml = temporaryPassword
      ? `<p style="margin:0 0 8px;">Your temporary password:</p>
         ${emailCodeBlock(temporaryPassword, 'md')}
         <p style="margin:0 0 18px;">You'll be asked to change it the first time you sign in.</p>
         ${emailButton(loginUrl, 'Sign in to Edrion')}`
      : `<p style="margin:0 0 18px;">Click below to activate your account and set your password.</p>${emailButton(loginUrl, 'Activate your account')}`;
    const html = emailLayout({
      heading: `You're the administrator for ${displayName}`,
      preheader: 'Set up your Edrion administrator account',
      footer: REGISTRATION_FOOTER,
      bodyHtml: `<p style="margin:0 0 16px;">Hi ${fullName}, you've been set up as the primary administrator for <strong>${displayName}</strong> on Edrion.</p>${credHtml}`,
    });
    return this.email.send({
      to,
      subject: `Activate your Edrion administrator account`,
      text,
      html,
    });
  }

  sendPasswordReset(
    to: string,
    fullName: string,
    resetUrl: string,
    institutionName?: string,
  ): Promise<SentEmail> {
    const institutionNote = institutionName ? ` for ${institutionName}` : '';
    const htmlInstitutionNote = escapeHtml(institutionNote);
    const text = `Hi ${fullName}, we received a request to reset your Edrion password${institutionNote}. Use this link to choose a new one (it expires in 1 hour): ${resetUrl}. If you didn't request this, you can safely ignore this email.`;
    const html = emailLayout({
      heading: `Reset your password${institutionNote}`,
      preheader: 'Choose a new Edrion password',
      footer: REGISTRATION_FOOTER,
      bodyHtml: `<p style="margin:0 0 16px;">Hi ${fullName}, we received a request to reset the password on your Edrion account${htmlInstitutionNote}.</p>
        <p style="margin:0 0 18px;">Click below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
        ${emailButton(resetUrl, 'Reset your password')}
        <p style="margin:18px 0 0;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    });
    return this.email.send({
      to,
      subject: `Reset your Edrion password${institutionNote}`,
      text,
      html,
    });
  }

  sendWelcome(to: string, displayName: string, loginUrl: string): Promise<SentEmail> {
    const text = `Welcome to Edrion! ${displayName} is now in onboarding. Sign in any time at ${loginUrl} to track your onboarding checklist.`;
    const html = emailLayout({
      heading: 'Welcome to Edrion',
      preheader: `${displayName} onboarding has started`,
      footer: REGISTRATION_FOOTER,
      bodyHtml: `<p style="margin:0 0 16px;">We're thrilled to welcome <strong>${displayName}</strong> to Edrion. Your onboarding has begun and a checklist is waiting in your workspace.</p>
        <p style="margin:0 0 18px;">Sign in any time to track progress through configuration, training and go-live.</p>${emailButton(loginUrl, 'Open your workspace')}`,
    });
    return this.email.send({ to, subject: `Welcome to Edrion, ${displayName}`, text, html });
  }
}
