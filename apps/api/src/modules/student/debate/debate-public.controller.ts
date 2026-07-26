import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { schema, type Database } from '@edrion/database';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { DATABASE } from '../../../common/tokens';

@ApiTags('student-debate-public')
@Controller('student/debate/shared')
@Public()
@SkipRateLimit()
export class DebatePublicController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get(':token')
  async sharedReport(@Param('token') token: string) {
    const hash = createHash('sha256').update(token).digest('hex');
    const [report] = await this.db
      .select()
      .from(schema.debateFeedbackReports)
      .where(eq(schema.debateFeedbackReports.shareToken, hash))
      .limit(1);
    if (!report || report.shareScope === 'private') {
      return { report: null };
    }
    const [verdict] = await this.db
      .select()
      .from(schema.debateVerdicts)
      .where(eq(schema.debateVerdicts.runId, report.runId))
      .limit(1);
    return {
      report: {
        roundSummary: report.roundSummary,
        perSpeaker: report.perSpeaker,
      },
      verdict,
      beta: true,
    };
  }
}
