import type { LocalAnswer, ExamRoomQuestion } from '../answer-model';

export type QuestionInputProps = {
  question: ExamRoomQuestion;
  value: LocalAnswer;
  onChange: (patch: Partial<LocalAnswer>) => void;
  disabled?: boolean;
};

export type { LocalAnswer, ExamRoomQuestion };
