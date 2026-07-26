import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { and, eq, schema, sql } from '@edrion/database';
import type { Database } from '@edrion/database';
import { DATABASE, LEARN_AI_PROVIDER } from '../../../common/tokens';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import { ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import type { LearnAiProvider } from '../learn-ai/provider';

@ApiTags('student-library-ask')
@Controller('student/library/items')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class LibraryAskController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
  ) {}

  @Post(':id/ask')
  @RequireStudentPermissions('student.library.use')
  async ask(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: { question: string },
    @Res() res: Response,
  ) {
    const [item] = await this.db
      .select()
      .from(schema.knowledgeItems)
      .where(
        and(
          eq(schema.knowledgeItems.id, id),
          ownerWhere(principal, schema.knowledgeItems.studentId, schema.knowledgeItems.independentUserId),
        ),
      )
      .limit(1);
    if (!item) throw new HttpException('NOT_FOUND', HttpStatus.NOT_FOUND);
    if (!item.indexReady) {
      throw new HttpException({ code: 'INDEX_NOT_READY' }, HttpStatus.CONFLICT);
    }

    res.setHeader('Content-Type', 'text/event-stream');

    let chunks: Array<{ id: string; page: number; content: string }> = [];
    if (this.ai.available) {
      const { vectors } = await this.ai.embedTexts([body.question]);
      const queryVec = vectors[0];
      if (queryVec?.length) {
        const rows = await this.db.execute(sql`
          SELECT id, page, content
          FROM knowledge_chunks
          WHERE knowledge_item_id = ${id}::uuid
            AND embedding IS NOT NULL
          ORDER BY embedding <=> ${JSON.stringify(queryVec)}::vector
          LIMIT 8
        `);
        chunks = (rows as unknown as Array<{ id: string; page: number; content: string }>);
      }
    }

    if (!chunks.length) {
      chunks = await this.db
        .select({
          id: schema.knowledgeChunks.id,
          page: schema.knowledgeChunks.page,
          content: schema.knowledgeChunks.content,
        })
        .from(schema.knowledgeChunks)
        .where(eq(schema.knowledgeChunks.knowledgeItemId, id))
        .limit(8);
    }

    if (!chunks.length) {
      res.write(`data: ${JSON.stringify({ delta: "I couldn't find that in this document." })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      return res.end();
    }

    const context = chunks.map((c) => `[p.${c.page}] ${c.content}`).join('\n\n');
    const stream = this.ai.streamText({
      purpose: 'ask',
      tier: 'small',
      system:
        'Answer only from the provided document chunks. Cite page numbers. If the answer is not in the chunks, say you could not find it in this document.',
      user: `Question: ${body.question}\n\nChunks:\n${context}`,
      maxOutputTokens: 800,
    });

    for await (const event of stream) {
      if (event.type === 'delta') {
        res.write(`data: ${JSON.stringify({ delta: event.text })}\n\n`);
      }
    }
    res.write(
      `data: ${JSON.stringify({ citations: chunks.map((c) => ({ page: c.page, chunk_id: c.id })) })}\n\n`,
    );
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
}
