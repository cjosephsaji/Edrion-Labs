export type BlockAnswerResult = {
  evaluation: {
    correct?: boolean;
    accepted?: boolean;
    feedback?: string;
  };
  session: import('@edrion/schemas').LearnSessionDto;
};
