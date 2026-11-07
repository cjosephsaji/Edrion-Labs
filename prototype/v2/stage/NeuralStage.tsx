'use client';
import type { StageState } from './lesson';
import StageExperience, { type StageExperienceProps } from './StageExperience';
import { NeuralSpecimen } from './NeuralSpecimen';
import { neuralLesson } from './lessons/neural';
import { neuralStageState } from './logic';
export default function NeuralStage(
  props: Omit<
    StageExperienceProps<StageState>,
    'state' | 'lesson' | 'Specimen'
  >,
) {
  return (
    <StageExperience
      {...props}
      state={neuralStageState(props.sim)}
      lesson={neuralLesson}
      Specimen={NeuralSpecimen}
    />
  );
}
