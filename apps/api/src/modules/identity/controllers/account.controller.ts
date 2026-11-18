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
import { AccountService, type AccountInfo } from '../application/account-service';
import { IdentityService } from '../application/identity-service';
import { AuthGuard, Roles, type AuthenticatedRequest } from './auth.guard';
import { clientIp, SESSION_COOKIE, type HttpResponse } from './http-types';
import { IdentityExceptionFilter } from './identity-exception.filter';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

@Controller('identity/account')
@UseFilters(IdentityExceptionFilter)
export class AccountController {
  constructor(
    private readonly accounts: AccountService,
    private readonly identity: IdentityService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @Roles('customer', 'staff', 'admin')
  info(@Req() req: AuthenticatedRequest): Promise<AccountInfo> {
    return this.accounts.info(req.auth!.session);
  }

  @Post('reauth')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Roles('customer')
  reauth(@Body() body: { password?: unknown }, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.accounts.reauthenticate(req.auth!.session, str(body?.password), clientIp(req));
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Roles('customer', 'staff', 'admin')
  async changePassword(
    @Body() body: { currentPassword?: unknown; newPassword?: unknown },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<void> {
    const { sessionId, session } = req.auth!;
    const result = await this.accounts.changePassword(
      sessionId,
      session,
      str(body?.currentPassword),
      str(body?.newPassword),
      clientIp(req),
    );
    res.cookie(SESSION_COOKIE, result.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: this.identity.sessionTtlMs,
    });
  }

  @Post('email-change')
  @HttpCode(202)
  @UseGuards(AuthGuard)
  @Roles('customer')
  async requestEmailChange(
    @Body() body: { newEmail?: unknown; password?: unknown },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.accounts.requestEmailChange(
      req.auth!.session,
      str(body?.newEmail),
      str(body?.password),
      clientIp(req),
    );
    return { message: 'Si el correo está disponible, te enviamos un enlace de confirmación.' };
  }

  @Post('email-change/confirm')
  @HttpCode(204)
  async confirmEmailChange(
    @Body() body: { token?: unknown },
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.accounts.confirmEmailChange(str(body?.token), clientIp(req));
  }
}
