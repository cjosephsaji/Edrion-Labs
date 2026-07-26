import { SAML, type SamlConfig } from '@node-saml/node-saml';

export interface SamlIdpConfig {
  spEntityId: string;
  idpEntityId: string;
  ssoUrl: string;
  idpCertificate: string;
  acsUrl: string;
}

export function createSamlClient(config: SamlIdpConfig): SAML {
  const pem = normalizePem(config.idpCertificate);
  const options: SamlConfig = {
    issuer: config.spEntityId,
    callbackUrl: config.acsUrl,
    entryPoint: config.ssoUrl,
    idpIssuer: config.idpEntityId,
    idpCert: pem,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
  };
  return new SAML(options);
}

export async function samlLoginRedirectUrl(saml: SAML, relayState: string): Promise<string> {
  return saml.getAuthorizeUrlAsync(relayState, undefined, {});
}

export async function samlValidateResponse(saml: SAML, body: Record<string, string>) {
  const result = await saml.validatePostResponseAsync(body);
  return result;
}

function normalizePem(cert: string): string {
  const trimmed = cert.trim();
  if (trimmed.includes('BEGIN CERTIFICATE')) return trimmed;
  const body = trimmed.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}
