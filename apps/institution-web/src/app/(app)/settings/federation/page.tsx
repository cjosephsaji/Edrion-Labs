'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Topbar } from '@/components/app-shell/topbar';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

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
  const [onerosterUrl, setOnerosterUrl] = useState('');
  const [onerosterToken, setOnerosterToken] = useState('');

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
    mutationFn: () => client.post('/portal/federation/roster/oneroster/import', scope, { csv }),
  });

  const onerosterRest = useMutation({
    mutationFn: () =>
      client.post('/portal/federation/roster/oneroster/sync', scope, {
        baseUrl: onerosterUrl,
        token: onerosterToken,
      }),
  });

  const cleverSync = useMutation({
    mutationFn: () => client.post('/portal/federation/roster/clever/sync', scope, {}),
  });

  const classlinkSync = useMutation({
    mutationFn: () => client.post('/portal/federation/roster/classlink/sync', scope, {}),
  });

  const jobs = useQuery({
    queryKey: ['portal', 'federation', 'jobs'],
    queryFn: () => client.get<unknown[]>('/portal/federation/roster/jobs', scope),
  });

  return (
    <>
      <Topbar title="SSO & roster" />
      <div className="flex flex-1 flex-col gap-4 p-5 lg:p-6">
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
            <textarea className="mt-2 h-20 w-full rounded-md border border-border bg-background p-2 text-xs font-mono" value={csv} onChange={(e) => setCsv(e.target.value)} />
            <button type="button" className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs" onClick={() => importCsv.mutate()}>Import</button>
            {importCsv.data != null ? <pre className="mt-2 text-xs">{JSON.stringify(importCsv.data, null, 2)}</pre> : null}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">OneRoster REST</p>
            <input className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-xs" placeholder="Base URL (…/ims/oneroster/v1p1)" value={onerosterUrl} onChange={(e) => setOnerosterUrl(e.target.value)} />
            <input className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-xs" placeholder="Bearer token" type="password" value={onerosterToken} onChange={(e) => setOnerosterToken(e.target.value)} />
            <button type="button" className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs" onClick={() => onerosterRest.mutate()}>Sync</button>
            {onerosterRest.data != null ? <pre className="mt-2 text-xs">{JSON.stringify(onerosterRest.data, null, 2)}</pre> : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">Clever</p>
            <button type="button" className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs" onClick={() => cleverSync.mutate()}>Run sync</button>
            {cleverSync.data != null ? <pre className="mt-2 text-xs">{JSON.stringify(cleverSync.data, null, 2)}</pre> : null}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">ClassLink</p>
            <button type="button" className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs" onClick={() => classlinkSync.mutate()}>Run sync</button>
            {classlinkSync.data != null ? <pre className="mt-2 text-xs">{JSON.stringify(classlinkSync.data, null, 2)}</pre> : null}
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
