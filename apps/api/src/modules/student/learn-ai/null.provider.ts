import { Injectable } from '@nestjs/common';
import {
  AiUnavailableError,
  type LearnAiProvider,
  type LearnAiStreamOpts,
  type LearnAiStreamTextOpts,
} from './provider';

@Injectable()
export class NullLearnAiProvider implements LearnAiProvider {
  readonly available = false;

  async completeJson(): Promise<never> {
    throw new AiUnavailableError();
  }

  async *streamJsonArray<T>(_opts: LearnAiStreamOpts<T>): AsyncIterable<T> {
    throw new AiUnavailableError();
  }

  async *streamText(_opts: LearnAiStreamTextOpts) {
    throw new AiUnavailableError();
  }
}
