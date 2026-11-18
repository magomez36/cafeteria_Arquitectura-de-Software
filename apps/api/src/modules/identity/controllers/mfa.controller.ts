import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { IdentityService } from '../application/identity-service';
import { MfaService } from '../application/mfa-service';
import { AllowUnverifiedMfa, AuthGuard, Roles, type AuthenticatedRequest } from './auth.guard';
import { clientIp, SESSION_COOKIE, type HttpResponse } from './http-types';
import { IdentityExceptionFilter } from './identity-exception.filter';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

@Controller('identity')
@UseFilters(IdentityExceptionFilter)
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly identity: IdentityService,
  ) {}

  private setSession(res: HttpResponse, sessionId: string): void {
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: this.identity.sessionTtlMs,
    });
  }

  @Post('login/mfa')
  @HttpCode(200)
  async loginMfa(
    @Body() body: { challengeId?: unknown; code?: unknown },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<unknown> {
    const result = await this.mfa.verifyLogin(
      str(body?.challengeId),
      str(body?.code),
      clientIp(req),
    );
    if (result.status !== 'authenticated') return { status: result.status };
    this.setSession(res, result.sessionId);
    return {
      status: 'authenticated',
      user: { displayName: result.session.displayName, role: result.session.role },
    };
  }

  /** Current user, also used by the web app to know whether MFA enrollment is pending. */
  @Get('session')
  @UseGuards(AuthGuard)
  @Roles('customer', 'staff', 'admin')
  @AllowUnverifiedMfa()
  session(@Req() req: AuthenticatedRequest): unknown {
    const { session } = req.auth!;
    return {
      user: { displayName: session.displayName, role: session.role },
      mfaVerified: session.mfaVerified,
    };
  }

  @Post('mfa/enroll')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Roles('customer', 'staff', 'admin')
  @AllowUnverifiedMfa()
  enroll(@Req() req: AuthenticatedRequest): Promise<{ secret: string; otpauthUri: string }> {
    return this.mfa.startEnrollment(req.auth!.session);
  }

  @Post('mfa/confirm')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Roles('customer', 'staff', 'admin')
  @AllowUnverifiedMfa()
  async confirm(
    @Body() body: { code?: unknown },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<unknown> {
    const { sessionId, session } = req.auth!;
    const result = await this.mfa.confirmEnrollment(
      sessionId,
      session,
      str(body?.code),
      clientIp(req),
    );
    this.setSession(res, result.sessionId);
    return { mfaVerified: true };
  }
}
