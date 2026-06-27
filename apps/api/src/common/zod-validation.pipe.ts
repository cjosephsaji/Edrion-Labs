import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates a payload against a Zod schema (the same schema the frontend form uses). On
 * failure returns field-level details in the uniform error shape.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '_';
        (details[path] ??= []).push(issue.message);
      }
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Validation failed', details });
    }
    return result.data;
  }
}

/** Factory so a schema can be used inline: `@Body(zodBody(createInstitutionSchema))`. */
export function zodBody<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
