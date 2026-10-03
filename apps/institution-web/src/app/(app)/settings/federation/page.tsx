'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Topbar } from '@/components/app-shell/topbar';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import { PROVIDER_MAPPING_VERSION, rosterMappingContextSchema } from '@edrion/schemas';

type Provider = {
  id: string;
  name: string;
  kind: string;
  issuer: string;
  enabled: boolean;
};

export default function FederationSettingsPage() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const [idpKind, setIdpKind] = useState<'oidc' | 'saml'>('oidc');
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [ssoUrl, setSsoUrl] = useState('');
  const [idpCertificate, setIdpCertificate] = useState('');
  const [csv, setCsv] = useState('');
  const [mappingConnectionId, setMappingConnectionId] = useState('');
  const [mappingNamespace, setMappingNamespace] = useState('');
  const [upstreamRevision, setUpstreamRevision] = useState('');

  const providers = useQuery({
    queryKey: ['portal', 'federation', 'idp'],
    queryFn: () => client.get<Provider[]>('/portal/federation/identity-providers', scope),
  });

  const createIdp = useMutation({
    mutationFn: () => {
      if (idpKind === 'saml') {
        return client.post('/portal/federation/identity-providers', scope, {
          kind: 'saml',
          name,
          issuer,
          clientId,
          ssoUrl,
          idpCertificate,
          enabled: true,
        });
      }
      return client.post('/portal/federation/identity-providers', scope, {
        kind: 'oidc',
        name,
        issuer,
        clientId,
        clientSecret,
        enabled: true,
      });
    },
    onSuccess: () => {
      setName('');
      setIssuer('');
      setClientId('');
      setClientSecret('');
      setSsoUrl('');
      setIdpCertificate('');
      qc.invalidateQueries({ queryKey: ['portal', 'federation', 'idp'] });
    },
  });

  const importCsv = useMutation({
    mutationFn: () => {
      const mappingContext = mappingConnectionId ? rosterMappingContextSchema.parse({
        schemaVersion: PROVIDER_MAPPING_VERSION, connectionId: mappingConnectionId,
        namespace: mappingNamespace, upstreamRevision,
      }) : undefined;
      return client.request('/portal/federation/roster/oneroster/import', scope, { method: 'POST',
        headers: { 'x-petros-provider-mapping': PROVIDER_MAPPING_VERSION }, body: JSON.stringify({ csv, mappingContext }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'federation', 'jobs'] }),
  });

  const jobs = useQuery({
    queryKey: ['portal', 'federation', 'jobs'],
    queryFn: () => client.request<unknown[]>('/portal/federation/roster/jobs', scope, { method: 'GET',
      headers: { 'x-petros-provider-mapping': PROVIDER_MAPPING_VERSION } }),
  });

  return (
    <>
      <Topbar title="SSO & roster" />
      <div className="flex flex-1 flex-col gap-4 p-5 lg:p-6">
        <p className="text-sm text-text-secondary">Federated sign-in is unavailable until its authentication review is complete. Connection configuration and mapping review do not enable sign-in.</p>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex gap-2">
            <button type="button" className={`rounded-full px-3 py-1 text-xs ${idpKind === 'oidc' ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated'}`} onClick={() => setIdpKind('oidc')}>OIDC</button>
            <button type="button" className={`rounded-full px-3 py-1 text-xs ${idpKind === 'saml' ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated'}`} onClick={() => setIdpKind('saml')}>SAML</button>
          </div>
          <p className="mt-3 text-sm font-medium text-text-primary">{idpKind === 'oidc' ? 'OpenID Connect' : 'SAML 2.0'} identity provider</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder={idpKind === 'saml' ? 'IdP entity ID' : 'Issuer URL'} value={issuer} onChange={(e) => setIssuer(e.target.value)} />
            <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder={idpKind === 'saml' ? 'SP entity ID' : 'Client ID'} value={clientId} onChange={(e) => setClientId(e.target.value)} />
            {idpKind === 'oidc' ? (
              <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Client secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
            ) : (
              <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="IdP SSO URL" value={ssoUrl} onChange={(e) => setSsoUrl(e.target.value)} />
            )}
          </div>
          {idpKind === 'saml' && (
            <textarea className="mt-2 h-24 w-full rounded-md border border-border bg-background p-2 text-xs font-mono" placeholder="IdP X.509 certificate (PEM or base64)" value={idpCertificate} onChange={(e) => setIdpCertificate(e.target.value)} />
          )}
          <button type="button" className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" onClick={() => createIdp.mutate()}>
            Save provider
          </button>
          <ul className="mt-3 space-y-1 text-xs text-text-secondary">
            {(providers.data ?? []).map((p) => (
              <li key={p.id}>
                [{p.kind}] {p.name} · {p.issuer} · {p.enabled ? 'enabled' : 'disabled'}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">OneRoster CSV</p>
            <p className="text-xs text-text-secondary">Preview only. No people, roles or enrollments are changed. Mapping preview requires enabled compatibility support and institution-wide owner permissions.</p>
            <label className="mt-2 block text-xs">Existing connection for mapping preview (optional)
              <select className="block w-full rounded-md border border-border bg-background p-2" value={mappingConnectionId} onChange={(e) => setMappingConnectionId(e.target.value)}>
                <option value="">Counts only · unmapped</option>
                {(providers.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {mappingConnectionId ? <>
              <label className="mt-2 block text-xs">Publisher namespace<input className="block w-full rounded-md border border-border bg-background p-2" value={mappingNamespace} onChange={(e) => setMappingNamespace(e.target.value)} /></label>
              <label className="mt-2 block text-xs">Upstream revision<input className="block w-full rounded-md border border-border bg-background p-2" value={upstreamRevision} onChange={(e) => setUpstreamRevision(e.target.value)} /></label>
            </> : null}
            <textarea aria-label="OneRoster users CSV" className="mt-2 h-20 w-full rounded-md border border-border bg-background p-2 text-xs font-mono" value={csv} onChange={(e) => setCsv(e.target.value)} />
            <button type="button" className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs" disabled={importCsv.isPending} onClick={() => importCsv.mutate()}>Preview</button>
            {importCsv.error ? <p role="alert">{formatPortalError(importCsv.error, 'Could not preview the mappings.')}</p> : null}
            {importCsv.data != null ? <pre className="mt-2 text-xs">{JSON.stringify(importCsv.data, null, 2)}</pre> : null}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">OneRoster REST</p>
            <p className="mt-2 text-xs text-text-secondary">Unavailable. External roster synchronization is disabled. Use OneRoster CSV to preview roster records.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">Clever</p>
            <p className="mt-2 text-xs text-text-secondary">Unavailable. External roster synchronization is disabled.</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">ClassLink</p>
            <p className="mt-2 text-xs text-text-secondary">Unavailable. External roster synchronization is disabled.</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text-primary">Recent roster jobs</p>
          <pre className="mt-2 max-h-40 overflow-auto text-xs text-text-secondary">{JSON.stringify(jobs.data ?? [], null, 2)}</pre>
        </div>
      </div>
    </>
  );
}
