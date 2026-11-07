'use client';
import StageExperience, { type StageExperienceProps } from './StageExperience';
import type { RocketStageState } from './rocket-logic';
import { rocketStageState } from './rocket-logic';
import { rocketLesson } from './lessons/rocket';
import { RocketSpecimen } from './RocketSpecimen';
export default function RocketStage(
  props: Omit<
    StageExperienceProps<RocketStageState>,
    'state' | 'lesson' | 'Specimen'
  >,
) {
  return (
    <StageExperience
      {...props}
      state={rocketStageState(props.sim)}
      lesson={rocketLesson}
      Specimen={RocketSpecimen}
    />
  );
}
