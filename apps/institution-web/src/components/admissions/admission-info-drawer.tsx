'use client';
import { useState } from 'react';
import { Check, Copy, Paperclip, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Drawer, Input, Label, Select } from '@edrion/ui';
import { PortalClientError } from '@/lib/portal-client';
import { useCreateInfoRequest, useInfoRequests, useInfoFileUrl, type InfoFieldDef, type InfoFileRef } from '@/lib/admission-info';
import type { AdmissionRow } from '@/lib/admissions-types';

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'date', label: 'Date' },
  { value: 'file', label: 'File upload' },
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'field';

type Builder = { label: string; type: InfoFieldDef['type']; optionsText: string; required: boolean; multiple: boolean };
const emptyField = (): Builder => ({ label: '', type: 'text', optionsText: '', required: false, multiple: false });

/**
 * Staff drawer to request additional info on an application: build a custom form (any mix of text /
 * dropdown / multiple-choice / date / file-upload fields), send the applicant a secure link, and
 * review their responses. Sending moves the application to "info requested" + emails the applicant.
 */
export function AdmissionInfoDrawer({ application, open, onClose }: { application: AdmissionRow | null; open: boolean; onClose: () => void }) {
  const appId = application?.id ?? '';
  const requests = useInfoRequests(open ? appId || null : null);
  const create = useCreateInfoRequest(appId);
  const fileUrl = useInfoFileUrl();

  const [message, setMessage] = useState('');
  const [fields, setFields] = useState<Builder[]>([emptyField()]);
  const [error, setError] = useState<string | null>(null);
  const [sentLink, setSentLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setField = (i: number, patch: Partial<Builder>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  async function send() {
    setError(null);
    const built: InfoFieldDef[] = [];
    const keys = new Set<string>();
    for (const f of fields) {
      if (!f.label.trim()) return setError('Every field needs a label.');
      let key = slug(f.label);
      while (keys.has(key)) key += '_2';
      keys.add(key);
      const needsOptions = f.type === 'select' || f.type === 'mcq';
      const options = needsOptions ? f.optionsText.split(',').map((o) => o.trim()).filter(Boolean) : undefined;
      if (needsOptions && (!options || options.length === 0)) return setError(`Add comma-separated choices for "${f.label}".`);
      built.push({ key, label: f.label.trim(), type: f.type, options, required: f.required, multiple: f.type === 'file' ? f.multiple : undefined });
    }
    try {
      const res = await create.mutateAsync({ message: message.trim() || undefined, fields: built });
      setSentLink(res.link);
      setMessage('');
      setFields([emptyField()]);
    } catch (e) {
      setError(e instanceof PortalClientError ? e.message : 'Could not send the request.');
    }
  }

  function copyLink() {
    if (!sentLink) return;
    navigator.clipboard?.writeText(sentLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Request more information"
      description={application ? `${application.firstName} ${application.lastName} (${application.applicationNo})` : ''}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={send} loading={create.isPending}>Send to applicant</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {sentLink && (
          <div className="rounded-md border border-success/30 bg-success-soft/40 p-3 text-sm">
            <p className="font-medium text-text-primary">Request sent — the applicant was emailed a secure link.</p>
            <div className="mt-2 flex items-center gap-2">
              <input readOnly value={sentLink} className="min-w-0 flex-1 truncate rounded border border-border bg-surface px-2 py-1 text-xs text-text-secondary" />
              <button type="button" onClick={copyLink} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:text-primary">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Builder */}
        <section>
          <Label htmlFor="info-msg">Message to applicant</Label>
          <textarea
            id="info-msg"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Please attach a birth certificate and confirm the blood group."
            className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong"
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">Fields to collect</span>
            <button type="button" onClick={() => setFields((f) => [...f, emptyField()])} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add field
            </button>
          </div>
          {fields.map((f, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Input placeholder="Field label (e.g. Birth certificate)" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
                  <div className="flex gap-2">
                    <Select value={f.type} options={FIELD_TYPES} onChange={(e) => setField(i, { type: e.target.value as InfoFieldDef['type'] })} />
                    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-text-secondary">
                      <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} className="h-3.5 w-3.5" /> Required
                    </label>
                    {f.type === 'file' && (
                      <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-text-secondary">
                        <input type="checkbox" checked={f.multiple} onChange={(e) => setField(i, { multiple: e.target.checked })} className="h-3.5 w-3.5" /> Multiple
                      </label>
                    )}
                  </div>
                  {(f.type === 'select' || f.type === 'mcq') && (
                    <Input placeholder="Choices, comma-separated (e.g. A+, O+, B+)" value={f.optionsText} onChange={(e) => setField(i, { optionsText: e.target.value })} />
                  )}
                </div>
                {fields.length > 1 && (
                  <button type="button" aria-label="Remove field" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} className="mt-1 text-text-muted hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
        </section>

        {/* Past requests + responses */}
        {(requests.data?.items.length ?? 0) > 0 && (
          <section className="space-y-3 border-t border-border pt-4">
            <span className="text-sm font-semibold text-text-primary">Previous requests</span>
            {requests.data!.items.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-text-muted">{new Date(r.createdAt).toLocaleDateString()}</span>
                  <Badge tone={r.status === 'submitted' ? 'success' : r.status === 'cancelled' ? 'neutral' : 'warning'}>{r.status}</Badge>
                </div>
                {r.status === 'submitted' && r.responses ? (
                  <dl className="space-y-1">
                    {r.fields.map((f) => (
                      <div key={f.key} className="flex justify-between gap-3">
                        <dt className="text-text-secondary">{f.label}</dt>
                        <dd className="max-w-[60%] text-right text-text-primary">
                          {f.type === 'file' ? (
                            <span className="flex flex-col items-end gap-0.5">
                              {((r.responses![f.key] as InfoFileRef[]) ?? []).map((file, k) => (
                                <a key={k} href={fileUrl(r.id, file.storageKey)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                  <Paperclip className="h-3 w-3" />{file.fileName}
                                </a>
                              ))}
                            </span>
                          ) : Array.isArray(r.responses![f.key]) ? (
                            (r.responses![f.key] as string[]).join(', ')
                          ) : (
                            String(r.responses![f.key] ?? '—')
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-text-muted">Awaiting the applicant’s response ({r.fields.length} fields).</p>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </Drawer>
  );
}
