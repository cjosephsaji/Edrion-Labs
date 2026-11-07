'use client';
import { useMemo } from 'react';
import StageExperience, { type StageExperienceProps } from './StageExperience';
import {
  attentionStageState,
  type AttentionStageState,
} from './attention-logic';
import { createAttentionLesson } from './lessons/attention';
import { AttentionSpecimen } from './AttentionSpecimen';
export default function AttentionStage(
  props: Omit<
    StageExperienceProps<AttentionStageState>,
    'state' | 'lesson' | 'Specimen'
  >,
) {
  const state = attentionStageState(props.sim),
    sentence = state.tokens.join(' ');
  const lesson = useMemo(
    () => createAttentionLesson(sentence.split(' ')),
    [sentence],
  );
  return (
    <StageExperience
      {...props}
      state={state}
      lesson={lesson}
      Specimen={AttentionSpecimen}
    />
  );
}
