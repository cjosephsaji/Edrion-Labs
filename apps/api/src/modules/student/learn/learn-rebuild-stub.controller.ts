import {
  Controller,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { RequireStudentPermissions } from '../core/student.decorators';

/**
 * Interim stubs while Ask / intent / sessions are rebuilt.
 * Keeps routes addressable so clients get a clear rebuild signal instead of 404.
 */
@ApiTags('student-learn-rebuild')
@Controller('student/learn')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class LearnRebuildStubController {
  @Post('intent')
  @HttpCode(503)
  intent() {
    throw new ServiceUnavailableException({
      code: 'LEARN_REBUILD',
      message: 'Learn intent routing is being rebuilt.',
    });
  }

  @Post('ask')
  @HttpCode(503)
  ask() {
    throw new ServiceUnavailableException({
      code: 'LEARN_REBUILD',
      message: 'Ask Petros is being rebuilt with the new Learn tutor.',
    });
  }

  @Post('ask/pin')
  @HttpCode(503)
  pinAsk() {
    throw new ServiceUnavailableException({
      code: 'LEARN_REBUILD',
      message: 'Ask Petros is being rebuilt with the new Learn tutor.',
    });
  }

  @Post('quick')
  @HttpCode(503)
  quick() {
    throw new ServiceUnavailableException({
      code: 'LEARN_REBUILD',
      message: 'Quick answers are being rebuilt.',
    });
  }
}
