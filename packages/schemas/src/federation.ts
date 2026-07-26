import { z } from 'zod';

export const upsertOidcProviderSchema = z.object({
  kind: z.literal('oidc'),
  name: z.string().min(1).max(120),
  issuer: z.string().url(),
  clientId: z.string().min(1).max(200),
  clientSecret: z.string().min(1).max(500).optional(),
  discoveryUrl: z.string().url().optional(),
  scopes: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  jitProvision: z.boolean().optional(),
});

export const upsertSamlProviderSchema = z.object({
  kind: z.literal('saml'),
  name: z.string().min(1).max(120),
  issuer: z.string().min(1).max(500),
  clientId: z.string().min(1).max(200),
  ssoUrl: z.string().url(),
  idpCertificate: z.string().min(32).max(12000),
  enabled: z.boolean().optional(),
  jitProvision: z.boolean().optional(),
});

export const upsertIdentityProviderSchema = z.discriminatedUnion('kind', [
  upsertOidcProviderSchema,
  upsertSamlProviderSchema,
]);

export type UpsertIdentityProviderInput = z.infer<typeof upsertIdentityProviderSchema>;

export const oidcStartSchema = z.object({
  providerId: z.string().uuid(),
  redirectUri: z.string().url(),
});

export type OidcStartInput = z.infer<typeof oidcStartSchema>;

export const samlStartSchema = oidcStartSchema;

export type SamlStartInput = z.infer<typeof samlStartSchema>;

export const oidcCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export type OidcCallbackInput = z.infer<typeof oidcCallbackSchema>;

export const onerosterCsvImportSchema = z.object({
  csv: z.string().min(1),
});

export type OnerosterCsvImportInput = z.infer<typeof onerosterCsvImportSchema>;

export const onerosterRestSyncSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1).max(4000),
});

export type OnerosterRestSyncInput = z.infer<typeof onerosterRestSyncSchema>;
