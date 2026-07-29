import type { StudentPrincipal } from '../../student.types';

export const LEARN_PROFILE_TOPIC_JOB = 'learn.profile-topic';
export const LEARN_MASTERY_SEED_JOB = 'learn.mastery-seed';

export type ProfileTopicJobData = {
  principal: StudentPrincipal;
  learnTopicId: string | null;
  topicKey: string;
  title: string;
  syllabusContext?: string | null;
  materialOutline?: string | null;
  materialFirstChunk?: string | null;
};

export type MasterySeedJobData = {
  studentId?: string | null;
  independentUserId?: string | null;
};
