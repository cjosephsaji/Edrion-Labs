import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import type { CanvasGraph } from '@edrion/schemas';

export function visualNotFound(): HttpException {
  return new HttpException(
    { code: 'VISUAL_NOT_FOUND', message: "This canvas isn't here." },
    HttpStatus.NOT_FOUND,
  );
}

export function visualSourceNotReady(): HttpException {
  return new HttpException(
    { code: 'VISUAL_SOURCE_NOT_READY', message: 'Petros is still reading this source.' },
    HttpStatus.CONFLICT,
  );
}

export function visualProposalExpired(): HttpException {
  return new HttpException(
    { code: 'VISUAL_PROPOSAL_EXPIRED', message: 'That suggestion has expired.' },
    HttpStatus.GONE,
  );
}

export function visualProposalStale(): HttpException {
  return new HttpException(
    {
      code: 'VISUAL_PROPOSAL_STALE',
      message: 'This canvas changed before the branch was added.',
    },
    HttpStatus.CONFLICT,
  );
}

export function visualLegacyRebuildRequired(message?: string): HttpException {
  return new HttpException(
    {
      code: 'VISUAL_LEGACY_REBUILD_REQUIRED',
      message: message ?? 'This older map needs a fresh layout.',
    },
    HttpStatus.CONFLICT,
  );
}

export function visualInvalidGraph(details?: Record<string, unknown>): HttpException {
  return new HttpException(
    {
      code: 'VISUAL_INVALID_GRAPH',
      message: 'This draft needs one fix before it can sync.',
      details,
    },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

export function visualArchetypeIncompatible(message: string): HttpException {
  return new HttpException(
    { code: 'VISUAL_ARCHETYPE_INCOMPATIBLE', message },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

export function topicDeclined(meta?: Record<string, unknown>): HttpException {
  return new HttpException(
    {
      code: 'TOPIC_DECLINED',
      message:
        'Visual Studio is for learning maps. If this belongs to your studies, add a little context and try once more.',
      meta,
    },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

export function aiLimitReached(meta: Record<string, unknown>): HttpException {
  return new HttpException(
    {
      code: 'AI_LIMIT_REACHED',
      message: 'Daily AI limit reached for this action.',
      meta,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function visualAiUnavailable(): HttpException {
  return new HttpException(
    {
      code: 'VISUAL_AI_UNAVAILABLE',
      message: "Petros can't build a new canvas right now. Your saved canvases are still here.",
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

export function visualQueueUnavailable(): HttpException {
  return new HttpException(
    {
      code: 'VISUAL_QUEUE_UNAVAILABLE',
      message: 'Canvas generation is paused right now. Try again shortly.',
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

export function visualGenerationFailed(): HttpException {
  return new HttpException(
    {
      code: 'VISUAL_GENERATION_FAILED',
      message: "This map didn't come together cleanly.",
    },
    HttpStatus.BAD_GATEWAY,
  );
}

export function revConflict(latestRevision: number, latestGraph: CanvasGraph): ConflictException {
  return new ConflictException({
    code: 'REV_CONFLICT',
    message: 'Someone else saved this canvas first.',
    latest_revision: latestRevision,
    latest_graph: latestGraph,
  });
}

export function payloadTooLarge(): HttpException {
  return new HttpException(
    {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'This canvas is too large to save. Shorten a few long notes.',
    },
    HttpStatus.PAYLOAD_TOO_LARGE,
  );
}
