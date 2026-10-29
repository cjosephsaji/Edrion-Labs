import { describe, expect, it, vi } from 'vitest';
import { RegistrationEmailService } from './registration-email.service';

function harness() {
  const send = vi.fn(
    async (_mail: { to: string; subject: string; text: string; html: string }) => ({
      messageId: 'test',
    }),
  );
  return { service: new RegistrationEmailService({ send } as never), send };
}

describe('approval notification for an existing institution account', () => {
  it('names the new institution and instructs the user to reuse their email/password and chooser', async () => {
    const { service, send } = harness();
    await service.sendExistingAccountApproved(
      'admin@example.com',
      'Alex',
      'New School',
      'https://portal.example.com/login',
    );
    const mail = send.mock.calls[0]![0];
    expect(mail.to).toBe('admin@example.com');
    expect(mail.subject).toContain('New School');
    expect(mail.text).toContain('current email (admin@example.com) and password');
    expect(mail.text).toContain('choose New School');
    expect(mail.text).toContain('No account activation or new password is needed');
    expect(mail.html).toContain('https://portal.example.com/login');
    expect(mail.html).not.toContain('/activate');
    expect(mail.html).not.toContain('temporary password');
  });
  it('escapes account and institution names in HTML', async () => {
    const { service, send } = harness();
    await service.sendExistingAccountApproved(
      'admin@example.com',
      'Alex <Admin>',
      'School & College <Test>',
      'https://portal.example.com/login',
    );
    const html = send.mock.calls[0]![0].html;
    expect(html).toContain('Alex &lt;Admin&gt;');
    expect(html).toContain('School &amp; College &lt;Test&gt;');
    expect(html).not.toContain('<Test>');
  });
  it('describes existing sign-in for IdP-only accounts without promising a password', async () => {
    const { service, send } = harness();
    await service.sendExistingAccountApproved(
      'admin@example.com',
      'Alex',
      'New School',
      'https://portal.example.com/login',
      false,
    );
    expect(send.mock.calls[0]![0].text).toContain('existing Edrion sign-in method');
    expect(send.mock.calls[0]![0].text).not.toContain('current email');
  });
  it('keeps activation instructions for first-time admins and avoids them for a separate existing-account applicant', async () => {
    const { service, send } = harness();
    await service.sendAdminInvitation(
      'new@example.com',
      'Alex',
      'New School',
      'https://portal.example.com/activate?token=token',
    );
    expect(send.mock.calls[0]![0].text).toContain('Activate your account and set your password');
    await service.sendApproved('contact@example.com', 'New School', true);
    expect(send.mock.calls[1]![0].text).toContain('already has an Edrion account');
    expect(send.mock.calls[1]![0].text).not.toContain('activate');
  });
});
