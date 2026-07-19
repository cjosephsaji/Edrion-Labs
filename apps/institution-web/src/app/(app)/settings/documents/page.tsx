'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Plus, UploadCloud } from 'lucide-react';
import { Badge, Button, Card, Drawer, Input, Label, PermissionDenied, Skeleton, Select } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

interface TemplateRow {
  id: string;
  institutionId: string | null;
  docType: string;
  name: string;
  html: string;
  css: string;
  headerConfig: Record<string, unknown>;
  isDefault: boolean;
  version: number;
}

const DOC_TYPES = ['exam_paper', 'assignment', 'circular', 'certificate', 'letter', 'report'];

/**
 * Settings → Documents: institution document templates (Handlebars-in-DB) over the platform
 * defaults. Header config is form-driven; raw HTML/CSS sits behind the Advanced section. Format
 * capture uploads a sample paper and prefills the header form from the vision proposal.
 */
export default function DocumentTemplatesPage() {
  const { can } = usePermissions();
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<TemplateRow> | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = can('documents.templates.manage');
  const templates = useQuery({
    queryKey: ['document-templates'],
    queryFn: () => client.get<{ items: TemplateRow[] }>('/portal/document-templates?pageSize=100', scope),
    enabled: can('documents.generate') || canManage,
  });

  const save = useMutation({
    mutationFn: async (t: Partial<TemplateRow>) => {
      if (t.id && t.institutionId) {
        return client.patch(`/portal/document-templates/${t.id}`, scope, {
          name: t.name,
          html: t.html,
          css: t.css,
          headerConfig: t.headerConfig ?? {},
          version: t.version,
        });
      }
      return client.post('/portal/document-templates', scope, {
        docType: t.docType,
        name: t.name,
        html: t.html,
        css: t.css ?? '',
        headerConfig: t.headerConfig ?? {},
      });
    },
    onSuccess: () => {
      setEditing(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['document-templates'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Save failed'),
  });

  async function formatCapture(file: File) {
    setCapturing(true);
    setError(null);
    try {
      const result = await client.upload<{ headerConfig: Record<string, unknown>; suggestedName: string }>(
        '/portal/document-templates/format-capture',
        scope,
        file,
      );
      setEditing((prev) => ({
        ...(prev ?? { docType: 'exam_paper', html: '{{body}}', css: '' }),
        name: prev?.name || result.suggestedName,
        headerConfig: result.headerConfig,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Format capture failed');
    } finally {
      setCapturing(false);
    }
  }

  if (!can('documents.generate') && !canManage) return <PermissionDenied />;

  return (
    <>
      <Topbar title="Document templates" />
      <div className="page-enter space-y-4 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            Institution overrides win over platform defaults per document type. Generated PDFs carry your letterhead.
          </p>
          {canManage && (
            <Button size="sm" onClick={() => setEditing({ docType: 'letter', name: '', html: '{{body}}', css: '', headerConfig: {} })}>
              <Plus className="h-4 w-4" /> New template
            </Button>
          )}
        </div>

        {templates.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(templates.data?.items ?? []).map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{t.name}</p>
                      <p className="text-xs text-text-muted">{t.docType.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <Badge tone={t.institutionId ? 'success' : 'neutral'}>{t.institutionId ? 'Yours' : 'Platform'}</Badge>
                </div>
                {canManage && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditing(
                          t.institutionId
                            ? { ...t }
                            : { docType: t.docType, name: `${t.name} (custom)`, html: t.html, css: t.css, headerConfig: t.headerConfig },
                        )
                      }
                    >
                      {t.institutionId ? 'Edit' : 'Customise'}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Drawer open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit template' : 'New template'}>
        {editing && (
          <div className="space-y-4 p-1">
            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <div>
              <Label>Document type</Label>
              <Select
                value={editing.docType}
                disabled={Boolean(editing.id)}
                onChange={(e) => setEditing({ ...editing, docType: e.target.value })}
                options={DOC_TYPES.map((d) => ({ value: d, label: d.replace(/_/g, ' ') }))}
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                Format capture
                {capturing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </Label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-text-secondary hover:border-primary">
                <UploadCloud className="h-4 w-4" />
                Upload a sample paper (image/PDF) to prefill the header layout
                <input
                  type="file"
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.pdf"
                  onChange={(e) => e.target.files?.[0] && void formatCapture(e.target.files[0])}
                />
              </label>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-text-secondary">Advanced: template HTML & CSS</summary>
              <div className="mt-2 space-y-3">
                <div>
                  <Label>HTML (Handlebars)</Label>
                  <textarea
                    value={editing.html ?? ''}
                    onChange={(e) => setEditing({ ...editing, html: e.target.value })}
                    rows={10}
                    className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label>CSS</Label>
                  <textarea
                    value={editing.css ?? ''}
                    onChange={(e) => setEditing({ ...editing, css: e.target.value })}
                    rows={5}
                    className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
                  />
                </div>
              </div>
            </details>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" disabled={!editing.name || save.isPending} onClick={() => save.mutate(editing)}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save template'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
