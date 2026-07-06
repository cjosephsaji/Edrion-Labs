'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Input, Label, Select } from '@edrion/ui';
import { useEnrolAdmission } from '@/lib/admissions';
import {
  useDepartmentOptions,
  useProgrammeLevelOptions,
  useSectionOptionsByProgrammeLevel,
  useTermOptionsByProgrammeLevel,
} from '@/lib/academics';
import { useTerm } from '@/lib/term';
import { PortalClientError } from '@/lib/portal-client';
import type { AdmissionRow } from '@/lib/admissions-types';

/**
 * Enrol an accepted applicant: confirms the admission number and optionally places the student
 * into a section via Programme → Year → Semester → Section cascade (when programme links exist).
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
  const { t } = useTerm();
  const { data: departments } = useDepartmentOptions();
  const [departmentId, setDepartmentId] = useState('');
  const [programmeLevelId, setProgrammeLevelId] = useState('');
  const [termId, setTermId] = useState('');
  const { data: programmeLevels } = useProgrammeLevelOptions(departmentId || undefined);
  const { data: terms } = useTermOptionsByProgrammeLevel(programmeLevelId || undefined);
  const { data: sections } = useSectionOptionsByProgrammeLevel(
    programmeLevelId || undefined,
    termId || undefined,
  );
  const enrol = useEnrolAdmission();
  const [admissionNo, setAdmissionNo] = useState('');
  const [classId, setClassId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasProgrammeLinks = (programmeLevels?.items?.length ?? 0) > 0;

  useEffect(() => {
    if (open && application) {
      setAdmissionNo(application.applicationNo);
      setDepartmentId('');
      setProgrammeLevelId('');
      setTermId('');
      setClassId('');
      setError(null);
    }
  }, [open, application]);

  useEffect(() => {
    setProgrammeLevelId('');
    setTermId('');
    setClassId('');
  }, [departmentId]);

  useEffect(() => {
    setTermId('');
    setClassId('');
  }, [programmeLevelId]);

  useEffect(() => {
    setClassId('');
  }, [termId]);

  const sectionOptions = useMemo(
    () => (sections?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
    [sections],
  );

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
            Enrol {t('student').toLowerCase()}
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
          This creates a {t('student').toLowerCase()} record from the application and marks it as enrolled.
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
        {hasProgrammeLinks && (
          <>
            <div>
              <Label htmlFor="enrol-programme">{t('department')}</Label>
              <Select
                id="enrol-programme"
                value={departmentId}
                placeholder="Select…"
                options={(departments?.items ?? []).map((d) => ({ value: d.id, label: d.name }))}
                onChange={(e) => setDepartmentId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="enrol-year">{t('gradeLevel')}</Label>
              <Select
                id="enrol-year"
                value={programmeLevelId}
                placeholder={departmentId ? 'Select…' : `Choose ${t('department').toLowerCase()} first`}
                disabled={!departmentId}
                options={(programmeLevels?.items ?? []).map((l) => ({
                  value: l.id,
                  label: l.gradeLevelName ?? l.gradeLevelId,
                }))}
                onChange={(e) => setProgrammeLevelId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="enrol-term">{t('term')}</Label>
              <Select
                id="enrol-term"
                value={termId}
                placeholder={programmeLevelId ? 'Optional' : `Choose ${t('gradeLevel').toLowerCase()} first`}
                disabled={!programmeLevelId}
                options={(terms?.items ?? []).map((x) => ({ value: x.id, label: x.name }))}
                onChange={(e) => setTermId(e.target.value)}
              />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="enrol-class">{t('class')} (optional)</Label>
          <Select
            id="enrol-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            placeholder="Assign later"
            options={sectionOptions}
          />
        </div>
      </div>
    </Drawer>
  );
}
