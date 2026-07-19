'use client';

import { useEffect, useState } from 'react';
import { Input, Label, Select } from '@edrion/ui';
import {
  useProgrammeLevelSelectOptions,
  useProgrammeSlotSelectOptions,
} from '@/lib/academics';
import type { ResourceFormExtraApi } from './resource-form';
import { useTerm } from '@/lib/term';

interface ProgrammeSlotFieldsProps {
  /** When set, registers placement fields on a parent ResourceForm submit payload. */
  setSubmitPayload?: ResourceFormExtraApi['setSubmitPayload'];
  /** Standalone mode — parent reads values via onChange. */
  onChange?: (values: {
    programmeLevelId: string;
    slotId: string;
    credits: string;
    isElective: boolean;
  }) => void;
  showCredits?: boolean;
  showElective?: boolean;
}

/**
 * Pick a programme year and one of its named term slots (e.g. "Semester 7"), not a raw 1–12 index.
 */
export function ProgrammeSlotFields({
  setSubmitPayload,
  onChange,
  showCredits = false,
  showElective = false,
}: ProgrammeSlotFieldsProps) {
  const { t } = useTerm();
  const { options: levelOptions } = useProgrammeLevelSelectOptions();
  const [programmeLevelId, setProgrammeLevelId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [credits, setCredits] = useState('');
  const [isElective, setIsElective] = useState(false);
  const { options: slotOptions, hasStructure } = useProgrammeSlotSelectOptions(
    programmeLevelId || undefined,
  );

  useEffect(() => {
    setSlotId('');
  }, [programmeLevelId]);

  useEffect(() => {
    const payload = {
      placementProgrammeLevelId: programmeLevelId || undefined,
      placementSlotId: slotId || undefined,
      placementCredits: credits === '' ? undefined : Number(credits),
      placementIsElective: isElective,
    };
    setSubmitPayload?.(payload);
    onChange?.({ programmeLevelId, slotId, credits, isElective });
  }, [programmeLevelId, slotId, credits, isElective, setSubmitPayload, onChange]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-background-secondary/30 p-3">
      <p className="text-xs font-medium text-text-secondary">
        Place in programme <span className="font-normal text-text-muted">(optional)</span>
      </p>
      <Select
        value={programmeLevelId}
        onChange={(e) => setProgrammeLevelId(e.target.value)}
        placeholder={
          levelOptions.length
            ? `${t('department')} and ${t('gradeLevel')}…`
            : 'No programme years defined yet'
        }
        options={levelOptions}
        disabled={levelOptions.length === 0}
      />
      <div>
        <Label>{t('term')}</Label>
        <Select
          value={slotId}
          onChange={(e) => setSlotId(e.target.value)}
          placeholder={
            !programmeLevelId
              ? `Pick a ${t('gradeLevel').toLowerCase()} first`
              : hasStructure
                ? `Pick a ${t('term').toLowerCase()}…`
                : 'No term slots in this programme yet'
          }
          options={slotOptions}
          disabled={!programmeLevelId || !hasStructure}
        />
      </div>
      {showCredits && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Credits</Label>
            <Input
              type="number"
              min={0}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      )}
      {showElective && (
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={isElective}
            onChange={(e) => setIsElective(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Elective in this {t('term').toLowerCase()}
        </label>
      )}
    </div>
  );
}
