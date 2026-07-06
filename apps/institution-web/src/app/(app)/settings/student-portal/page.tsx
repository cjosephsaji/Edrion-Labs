'use client';

import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle, Checkbox, ErrorState, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { useSetStudentPortalSurface, useStudentPortalSurfaces } from '@/lib/student-portal';

export default function StudentPortalSettingsPage() {
  const { can } = usePermissions();
  const { data, isLoading, error } = useStudentPortalSurfaces();
  const setSurface = useSetStudentPortalSurface();
  const canManage = can('student_portal.manage');

  if (!canManage) {
    return (
      <>
        <Topbar title="Student portal" />
        <div className="p-6 text-sm text-text-secondary">
          You need <code className="text-xs">student_portal.manage</code> to configure the student portal.
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Student portal" />
      <div className="page-enter mx-auto flex w-full max-w-3xl flex-col gap-6 p-5">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Link href="/settings" className="hover:text-text-primary">
            Settings
          </Link>
          <span>/</span>
          <span className="text-text-primary">Student portal</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              What students can see
            </CardTitle>
            <CardDescription>
              Off means absent — students never see a disabled stub. The master toggle controls the whole portal.
            </CardDescription>
          </CardHeader>
          <div className="space-y-4 px-6 pb-6">
            {isLoading && <Skeleton className="h-24 w-full" />}
            {error && <ErrorState title="Could not load surfaces" description="Try again in a moment." />}
            {data && (
              <>
                <SurfaceRow
                  label="Student portal (master)"
                  description="Kill-switch for the entire student portal"
                  enabled={data.portalEnabled}
                  loading={setSurface.isPending}
                  onChange={(value) => setSurface.mutate({ featureFlagKey: 'student.portal', value })}
                />
                <hr className="border-border" />
                {data.surfaces.map((s) => (
                  <SurfaceRow
                    key={s.key}
                    label={s.label}
                    description={`Surface: ${s.key}`}
                    enabled={s.enabled}
                    loading={setSurface.isPending}
                    onChange={(value) => setSurface.mutate({ featureFlagKey: s.featureFlagKey, value })}
                  />
                ))}
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function SurfaceRow({
  label,
  description,
  enabled,
  loading,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  loading: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <Checkbox checked={enabled} disabled={loading} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}
