'use client';
import StageExperience, { type StageExperienceProps } from './StageExperience';
import {
  relativityStageState,
  type RelativityStageState,
} from './relativity-logic';
import { relativityLesson } from './lessons/relativity';
import { RelativitySpecimen } from './RelativitySpecimen';
export default function RelativityStage(
  props: Omit<
    StageExperienceProps<RelativityStageState>,
    'state' | 'lesson' | 'Specimen'
  >,
) {
  return (
    <StageExperience
      {...props}
      state={relativityStageState(props.sim)}
      lesson={relativityLesson}
      Specimen={RelativitySpecimen}
    />
  );
}
