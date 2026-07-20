'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileCheck2, XCircle } from 'lucide-react';
import { webEnv } from '@/lib/env';

interface Verification {
  issuer: string;
  studentInitials: string;
  docType: string;
  issueDate: string;
  status: 'valid' | 'revoked';
}

export default function VerifyDocumentPage({ params }: { params: { code: string } }) {
  const query = useQuery({
    queryKey: ['document-verification', params.code],
    queryFn: async () => {
      const response = await fetch(`${webEnv.apiBaseUrl}/v1/documents/verify/${encodeURIComponent(params.code)}`);
      if (!response.ok) throw new Error('NOT_FOUND');
      return response.json() as Promise<Verification>;
    },
    retry: false,
  });

  return <main className="grid min-h-screen place-items-center bg-st-page p-5 text-st-ink">
    <section className="w-full max-w-lg rounded-2xl border border-st-bd1 bg-st-card p-7 shadow-lg">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-st-accentSoft text-st-accentDeep"><FileCheck2 className="h-6 w-6" /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-st-muted">Edrion document verification</p><h1 className="font-display text-xl font-semibold">Issued document</h1></div></div>
      {query.isLoading && <div className="mt-8 h-40 motion-safe:animate-pulse rounded-xl bg-st-page" />}
      {query.isError && <div className="mt-8 text-center"><XCircle className="mx-auto h-11 w-11 text-st-danger" /><h2 className="mt-3 text-lg font-semibold">Document not found</h2><p className="mt-1 text-sm text-st-muted">Check the code and try again. No document information was disclosed.</p></div>}
      {query.data && <div className="mt-8"><div className={`flex items-center gap-2 rounded-xl p-4 ${query.data.status === 'valid' ? 'bg-st-accentSoft text-st-accentDeep' : 'bg-st-page text-st-muted'}`}>{query.data.status === 'valid' ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}<span className="text-lg font-semibold">{query.data.status === 'valid' ? 'Valid' : 'Revoked'}</span></div><dl className="mt-6 grid grid-cols-2 gap-4 text-sm"><Item label="Issuer" value={query.data.issuer} /><Item label="Student" value={query.data.studentInitials} /><Item label="Document type" value={query.data.docType.replace(/_/g, ' ')} /><Item label="Issue date" value={new Date(query.data.issueDate).toLocaleDateString()} /></dl></div>}
      <p className="mt-8 border-t border-st-bd1 pt-4 font-mono text-xs text-st-muted">Code {params.code}</p>
    </section>
  </main>;
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase tracking-wide text-st-muted">{label}</dt><dd className="mt-1 capitalize font-medium">{value}</dd></div>; }
