import { Module } from '@nestjs/common';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import { LearningEventsRepository } from './learning-events.repository';
import { LearningEventsWriter } from './learning-events.writer';

@Module({
  providers: [
    LearningEventsRepository,
    LearningEventsWriter,
    { provide: LEARNING_EVENTS_WRITER, useExisting: LearningEventsWriter },
  ],
  exports: [LEARNING_EVENTS_WRITER, LearningEventsWriter],
})
export class LearningEventsModule {}
