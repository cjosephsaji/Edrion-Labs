import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../../common/tokens';
import { StudentAuthService } from '../auth/student-auth.service';
import { StudentSessionService } from './student-session.service';
import { STUDENT_PASSWORD_SETUP_KEY } from './student.decorators';

/**
 * Authenticates a student-portal request and attaches `studentContext`.
 *
 * Production: validate the HTTP-only student session cookie, load the student principal.
 * Dev (STUDENT_AUTH_DEV_HEADER): trust `x-student-email` when no cookie is present.
 */
@Injectable()
export class StudentAuthGuard implements CanActivate {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly sessions: StudentSessionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const { principal, authSessionId } = await this.resolvePrincipal(req);
    req.studentContext = { principal, authSessionId };
    if (principal.kind === 'institutional' && principal.passwordChangeRequired &&
      !Reflect.getMetadata(STUDENT_PASSWORD_SETUP_KEY, ctx.getHandler())) {
      throw new ForbiddenException({ code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change your temporary password before accessing your portal.' });
    }
    return true;
  }

  private async resolvePrincipal(
    req: Request,
  ): Promise<{ principal: Awaited<ReturnType<StudentAuthService['resolvePrincipal']>>; authSessionId?: string }> {
    const token = readCookie(req.headers.cookie, this.sessions.cookieName);
    if (token) {
      const session = await this.sessions.verify(token);
      const principal = await this.auth.resolvePrincipal(session);
      return { principal, authSessionId: session.sessionId };
    }

    if (this.env.STUDENT_AUTH_DEV_HEADER) {
      const email = req.header('x-student-email');
      if (email) {
        return { principal: await this.auth.resolveByEmail(email) };
      }
    }

    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message:
        'No student session. Sign in at /v1/student/auth/login (or set STUDENT_AUTH_DEV_HEADER=true and send x-student-email in development).',
    });
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
