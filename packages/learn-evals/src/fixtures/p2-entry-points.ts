/** P2 entry-point fixtures for learn-evals harness. */
export const P2_ENTRY_FIXTURES = [
  { entryPoint: 'bad_result', reportCardEntryId: '00000000-0000-4000-8000-000000000101' },
  { entryPoint: 'upcoming_exam', examScheduleId: '00000000-0000-4000-8000-000000000102' },
  { entryPoint: 'prep_countdown', examScheduleId: '00000000-0000-4000-8000-000000000103' },
  { entryPoint: 'review_queue', topicKey: 'topic:algebra' },
] as const;
