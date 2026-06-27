import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { ErrorReporter, Logger } from '@edrion/observability';
import { Public } from '../../common/guards/auth.guard';
import { RateLimit, ReqContext } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import { ERROR_REPORTER, LOGGER } from '../../common/tokens';

/** Crash report from the web app's error boundary. Bounded + sanitised before it is recorded. */
const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().trim().max(4000).optional(),
  componentStack: z.string().trim().max(4000).optional(),
  url: z.string().trim().max(500).optional(),
  correlationId: z.string().trim().max(64).optional(),
});
type ClientErrorReport = z.infer<typeof clientErrorSchema>;

@ApiTags('observability')
@Controller('observability')
export class ObservabilityController {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter,
  ) {}

  /**
   * Report a render crash from the web app's AppErrorBoundary. Public (a crashed shell may have
   * no usable session) and rate-limited (abuse guard). Logged with correlation + forwarded to the
   * error sink so client crashes land in the same place as server errors.
   */
  @Public()
  @Post('client-error')
  @RateLimit(20, 60)
  @HttpCode(HttpStatus.NO_CONTENT)
  report(
    @Body(zodBody(clientErrorSchema)) body: ClientErrorReport,
    @ReqContext() req: EdrionRequestContext,
  ): void {
    const correlationId = body.correlationId ?? req.correlationId;
    this.logger.child({ correlationId, requestId: req.requestId }).error('client.render_error', {
      source: 'web',
      message: body.message,
      url: body.url,
    });
    this.reporter.captureMessage(`web render crash: ${body.message}`, {
      correlationId,
      url: body.url,
      stack: body.stack,
      componentStack: body.componentStack,
    });
  }
}
