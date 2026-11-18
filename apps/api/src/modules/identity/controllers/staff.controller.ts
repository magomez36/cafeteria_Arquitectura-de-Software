import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { StaffService, type StaffSummary } from '../application/staff-service';
import { AuthGuard, Roles, type AuthenticatedRequest } from './auth.guard';
import { clientIp } from './http-types';
import { IdentityExceptionFilter } from './identity-exception.filter';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

@Controller('identity/staff')
@UseFilters(IdentityExceptionFilter)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /** Public: the invited person sets their password with the one-use link. */
  @Post('invitation/accept')
  @HttpCode(204)
  async accept(
    @Body() body: { token?: unknown; newPassword?: unknown },
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.staff.acceptInvite(str(body?.token), str(body?.newPassword), clientIp(req));
  }

  @Get()
  @UseGuards(AuthGuard)
  @Roles('admin')
  list(@Req() req: AuthenticatedRequest): Promise<StaffSummary[]> {
    return this.staff.list(req.auth!.session, clientIp(req));
  }

  @Post()
  @HttpCode(201)
  @UseGuards(AuthGuard)
  @Roles('admin')
  async invite(
    @Body() body: { fullName?: unknown; email?: unknown },
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.staff.invite(
      req.auth!.session,
      { fullName: str(body?.fullName), email: str(body?.email) },
      clientIp(req),
    );
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Roles('admin')
  deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.staff.deactivate(req.auth!.session, id, clientIp(req));
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Roles('admin')
  reactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.staff.reactivate(req.auth!.session, id, clientIp(req));
  }

  @Post(':id/mfa-reset')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Roles('admin')
  resetMfa(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.staff.resetMfa(req.auth!.session, id, clientIp(req));
  }
}
