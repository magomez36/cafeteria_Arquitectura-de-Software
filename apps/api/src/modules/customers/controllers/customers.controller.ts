import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Patch,
  Post,
  Put,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  CustomersService,
  type ConsentState,
  type DataExport,
  type DeletionResult,
} from '../application/customers-service';
import { CustomerForbiddenError, CustomerUnauthenticatedError } from '../domain/errors';
import type {
  CustomerProfile,
  CustomerSession,
  DataInventoryItem,
  OrderSummary,
} from '../domain/ports';
import { CustomersExceptionFilter } from './customers-exception.filter';

interface Req {
  readonly headers: Record<string, string | string[] | undefined>;
  customer?: CustomerSession;
}

const SESSION_COOKIE = 'cafeteria_session';

function readCookie(req: Req, name: string): string | null {
  const header = req.headers.cookie;
  const raw = Array.isArray(header) ? header.join(';') : (header ?? '');
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** Only an authenticated customer reaches these handlers; everything else is denied by default. */
@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly service: CustomersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Req>();
    const session = await this.service.resolveSession(readCookie(req, SESSION_COOKIE));
    if (!session) throw new CustomerUnauthenticatedError();
    if (session.role !== 'customer') throw new CustomerForbiddenError();
    req.customer = session;
    return true;
  }
}

const profileView = (p: CustomerProfile) => ({
  fullName: p.fullName,
  phone: p.phone,
  preferences: p.preferences,
});

@Controller('customers')
@UseFilters(CustomersExceptionFilter)
@UseGuards(CustomerGuard)
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get('me')
  async me(@Req() req: Req): Promise<ReturnType<typeof profileView>> {
    return profileView(await this.service.getProfile(req.customer!));
  }

  @Patch('me')
  async update(
    @Body() body: Record<string, unknown>,
    @Req() req: Req,
  ): Promise<ReturnType<typeof profileView>> {
    return profileView(
      await this.service.updateProfile(req.customer!, {
        fullName: body?.fullName,
        phone: body?.phone,
        preferences: body?.preferences,
      }),
    );
  }

  @Get('me/orders')
  orders(@Req() req: Req): Promise<{ available: boolean; orders: readonly OrderSummary[] }> {
    return this.service.listOrders(req.customer!);
  }

  @Get('data-inventory')
  inventory(): Promise<readonly DataInventoryItem[]> {
    return this.service.dataInventory();
  }

  @Get('me/consents')
  consents(@Req() req: Req): Promise<ConsentState[]> {
    return this.service.consentStates(req.customer!);
  }

  @Put('me/consents')
  setConsents(@Body() body: Record<string, unknown>, @Req() req: Req): Promise<ConsentState[]> {
    return this.service.setConsents(req.customer!, body ?? {});
  }

  @Post('me/export')
  @HttpCode(200)
  export(@Req() req: Req): Promise<DataExport> {
    return this.service.exportData(req.customer!);
  }

  @Post('me/deletion')
  @HttpCode(202)
  deletion(@Req() req: Req): Promise<DeletionResult> {
    return this.service.requestDeletion(req.customer!);
  }
}
