'use client';
import { useMemo } from 'react';
import StageExperience, { type StageExperienceProps } from './StageExperience';
import { trafficStageState, type TrafficStageState } from './traffic-logic';
import { createTrafficLesson } from './lessons/traffic';
import { TrafficSpecimen } from './TrafficSpecimen';
export default function TrafficStage(
  props: Omit<
    StageExperienceProps<TrafficStageState>,
    'state' | 'lesson' | 'Specimen'
  >,
) {
  const state = trafficStageState(props.sim),
    lesson = useMemo(() => createTrafficLesson(state.count), [state.count]);
  return (
    <StageExperience
      {...props}
      state={state}
      lesson={lesson}
      Specimen={TrafficSpecimen}
    />
  );
}
