import { Body, Controller, HttpCode, Post, Req, Res, UseFilters } from '@nestjs/common';
import { IdentityService } from '../application/identity-service';
import {
  clientIp,
  readCookie,
  SESSION_COOKIE,
  type HttpRequest,
  type HttpResponse,
} from './http-types';
import { IdentityExceptionFilter } from './identity-exception.filter';

interface RegisterBody {
  fullName?: unknown;
  email?: unknown;
  password?: unknown;
  acceptedPolicy?: unknown;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

@Controller('identity')
@UseFilters(IdentityExceptionFilter)
export class IdentityController {
  constructor(private readonly service: IdentityService) {}

  @Post('register')
  @HttpCode(202)
  async register(
    @Body() body: RegisterBody,
    @Req() req: HttpRequest,
  ): Promise<{ message: string }> {
    await this.service.register({
      fullName: str(body?.fullName),
      email: str(body?.email),
      password: str(body?.password),
      acceptedPolicy: body?.acceptedPolicy === true,
      ip: clientIp(req),
    });
    return {
      message:
        'Si el correo es válido, te enviamos un mensaje para continuar. Revisa tu bandeja de entrada.',
    };
  }

  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() body: { token?: unknown }, @Req() req: HttpRequest): Promise<void> {
    await this.service.verifyEmail(str(body?.token), clientIp(req));
  }

  @Post('resend-verification')
  @HttpCode(202)
  async resend(
    @Body() body: { email?: unknown },
    @Req() req: HttpRequest,
  ): Promise<{ message: string }> {
    await this.service.resendVerification(str(body?.email), clientIp(req));
    return { message: 'Si hay una cuenta pendiente con ese correo, te enviamos un nuevo enlace.' };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { email?: unknown; password?: unknown },
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<unknown> {
    const result = await this.service.login({
      email: str(body?.email),
      password: str(body?.password),
      ip: clientIp(req),
    });
    if (result.status === 'mfa_required') {
      return { status: 'mfa_required', challengeId: result.challengeId };
    }
    res.cookie(SESSION_COOKIE, result.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: this.service.sessionTtlMs,
    });
    return {
      status: result.status,
      user: { displayName: result.session.displayName, role: result.session.role },
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<void> {
    await this.service.logout(readCookie(req, SESSION_COOKIE), clientIp(req));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Post('password/forgot')
  @HttpCode(202)
  async forgot(
    @Body() body: { email?: unknown },
    @Req() req: HttpRequest,
  ): Promise<{ message: string }> {
    await this.service.forgotPassword(str(body?.email), clientIp(req));
    return {
      message:
        'Si el correo está registrado, te enviamos un enlace para elegir una nueva contraseña.',
    };
  }

  @Post('password/reset')
  @HttpCode(204)
  async reset(
    @Body() body: { token?: unknown; newPassword?: unknown },
    @Req() req: HttpRequest,
  ): Promise<void> {
    await this.service.resetPassword(str(body?.token), str(body?.newPassword), clientIp(req));
  }
}
