import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, ilike, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import { ownerColumns, ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';

@ApiTags('student-library-notes')
@Controller('student/library/notes')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class LibraryNotesController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  @RequireStudentPermissions('student.library.use')
  async list(@CurrentStudent() principal: StudentPrincipal, @Query('q') q?: string) {
    const rows = await this.db
      .select()
      .from(schema.libraryNotes)
      .where(
        and(
          ownerWhere(principal, schema.libraryNotes.studentId, schema.libraryNotes.independentUserId),
          q ? ilike(schema.libraryNotes.title, `%${q}%`) : undefined,
        ),
      )
      .orderBy(desc(schema.libraryNotes.updatedAt));
    return { notes: rows };
  }

  @Post()
  @RequireStudentPermissions('student.library.use')
  async create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const parsed = body as {
      title: string;
      doc?: Record<string, unknown>;
      subject_ref?: Record<string, unknown> | null;
      source_refs?: Array<{ knowledge_item_id: string; page: number }>;
    };
    const [row] = await this.db
      .insert(schema.libraryNotes)
      .values({
        ...ownerColumns(principal),
        title: parsed.title,
        doc: parsed.doc ?? {},
        subjectRef: (parsed.subject_ref as typeof schema.libraryNotes.$inferInsert.subjectRef) ?? null,
        sourceRefs: parsed.source_refs ?? [],
      })
      .returning();
    return row;
  }

  @Patch(':id')
  @RequireStudentPermissions('student.library.use')
  async update(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = body as {
      title?: string;
      doc?: Record<string, unknown>;
      version: number;
    };
    const [existing] = await this.db
      .select()
      .from(schema.libraryNotes)
      .where(
        and(
          eq(schema.libraryNotes.id, id),
          ownerWhere(principal, schema.libraryNotes.studentId, schema.libraryNotes.independentUserId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException();
    if (parsed.version !== existing.version) {
      throw new ConflictException({ code: 'VERSION_CONFLICT' });
    }
    const [row] = await this.db
      .update(schema.libraryNotes)
      .set({
        title: parsed.title ?? existing.title,
        doc: parsed.doc ?? existing.doc,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.libraryNotes.id, id))
      .returning();
    return row;
  }
}
