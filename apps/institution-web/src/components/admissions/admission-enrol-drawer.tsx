'use client';
import { useEffect, useState } from 'react';
import { Button, Drawer, Input, Label, Select } from '@edrion/ui';
import { useEnrolAdmission } from '@/lib/admissions';
import { useClassOptions } from '@/lib/academics';
import { PortalClientError } from '@/lib/portal-client';
import type { AdmissionRow } from '@/lib/admissions-types';

/**
 * Enrol an accepted applicant: confirms the admission number (defaults to the application number)
 * and optionally places the new student into a class. On success the API creates the `students`
 * row and links it back to the application (status → enrolled).
 */
export function AdmissionEnrolDrawer({
  application,
  open,
  onClose,
}: {
  application: AdmissionRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: classes } = useClassOptions();
  const enrol = useEnrolAdmission();
  const [admissionNo, setAdmissionNo] = useState('');
  const [classId, setClassId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && application) {
      setAdmissionNo(application.applicationNo);
      setClassId('');
      setError(null);
    }
  }, [open, application]);

  async function submit() {
    if (!application) return;
    setError(null);
    try {
      await enrol.mutateAsync({
        id: application.id,
        body: { admissionNo: admissionNo.trim() || undefined, classId: classId || null },
      });
      onClose();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not enrol this applicant.');
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Enrol applicant"
      description={application ? `${application.firstName} ${application.lastName}` : ''}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={enrol.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={enrol.isPending}>
            Enrol student
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        <p className="text-sm text-text-secondary">
          This creates a student record from the application and marks the application as enrolled.
        </p>
        <div>
          <Label htmlFor="enrol-admission-no">Admission no.</Label>
          <Input
            id="enrol-admission-no"
            value={admissionNo}
            onChange={(e) => setAdmissionNo(e.target.value)}
            placeholder="e.g. ADM-1024"
          />
        </div>
        <div>
          <Label htmlFor="enrol-class">Class (optional)</Label>
          <Select
            id="enrol-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            placeholder="Assign later"
            options={(classes?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </div>
    </Drawer>
  );
}
