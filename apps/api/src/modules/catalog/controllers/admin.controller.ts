import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UseFilters,
} from '@nestjs/common';
import { CatalogService } from '../application/catalog.service';
import {
  authorize,
  CATALOG_AUTHORIZER,
  type Actor,
  type CatalogAuthorizer,
  type Permission,
  type RequestHeaders,
} from '../domain/authorization';
import {
  parseAvailabilityPatch,
  parseCategoryName,
  parseItems,
  parseMenuUpdate,
  parseName,
  parseProductInput,
  parseUuid,
  parseVersionNumber,
} from '../domain/input';
import { formatEtag } from '../domain/revision';
import { CatalogErrorFilter } from './catalog-error.filter';

interface ResLike {
  setHeader(name: string, value: string): void;
}

/**
 * Administración del catálogo. Cada acción exige autorización en el servidor; por defecto
 * (sin autoridad de identidad integrada) todas devuelven 401.
 */
@Controller('catalog/admin')
@UseFilters(CatalogErrorFilter)
export class AdminController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(CATALOG_AUTHORIZER) private readonly authorizer: CatalogAuthorizer,
  ) {}

  private auth(headers: RequestHeaders, permission: Permission): Promise<Actor> {
    return authorize(this.authorizer, headers, permission);
  }

  private etag<T extends { revision: number }>(res: ResLike, draft: T): T {
    res.setHeader('ETag', formatEtag(draft.revision));
    return draft;
  }

  // ----- Menús -----

  @Get('menus')
  async listMenus(@Headers() h: RequestHeaders) {
    await this.auth(h, 'catalog.menu.write');
    return { menus: await this.catalog.listMenus() };
  }

  @Post('menus')
  @HttpCode(201)
  async createMenu(
    @Headers() h: RequestHeaders,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ResLike,
  ) {
    const actor = await this.auth(h, 'catalog.menu.write');
    return this.etag(res, await this.catalog.createMenu(parseName(body), actor.id));
  }

  @Get('menus/:id')
  async getMenu(
    @Headers() h: RequestHeaders,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: ResLike,
  ) {
    await this.auth(h, 'catalog.menu.write');
    return this.etag(res, await this.catalog.getDraft(parseUuid(id)));
  }

  @Put('menus/:id')
  async updateMenu(
    @Headers() h: RequestHeaders,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ResLike,
  ) {
    const actor = await this.auth(h, 'catalog.menu.write');
    return this.etag(
      res,
      await this.catalog.updateMenu(parseUuid(id), h['if-match'], actor.id, parseMenuUpdate(body)),
    );
  }

  @Post('menus/:id/categories')
  @HttpCode(201)
  async addCategory(
    @Headers() h: RequestHeaders,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ResLike,
  ) {
    const actor = await this.auth(h, 'catalog.menu.write');
    return this.etag(
      res,
      await this.catalog.addCategory(
        parseUuid(id),
        h['if-match'],
        actor.id,
        parseCategoryName(body),
      ),
    );
  }

  @Delete('menus/:id/categories/:categoryId')
  async removeCategory(
    @Headers() h: RequestHeaders,
    @Param('id') id: string,
    @Param('categoryId') categoryId: string,
    @Res({ passthrough: true }) res: ResLike,
  ) {
    const actor = await this.auth(h, 'catalog.menu.write');
    return this.etag(
      res,
      await this.catalog.removeCategory(
        parseUuid(id),
        h['if-match'],
        actor.id,
        parseUuid(categoryId, 'categoryId'),
      ),
    );
  }

  @Put('menus/:id/categories/:categoryId/items')
  async setItems(
    @Headers() h: RequestHeaders,
    @Param('id') id: string,
    @Param('categoryId') categoryId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ResLike,
  ) {
    const actor = await this.auth(h, 'catalog.menu.write');
    return this.etag(
      res,
      await this.catalog.setCategoryItems(
        parseUuid(id),
        h['if-match'],
        actor.id,
        parseUuid(categoryId, 'categoryId'),
        parseItems(body),
      ),
    );
  }

  @Get('menus/:id/preview')
  async preview(@Headers() h: RequestHeaders, @Param('id') id: string) {
    await this.auth(h, 'catalog.menu.write');
    return this.catalog.preview(parseUuid(id));
  }

  @Post('menus/:id/publish')
  @HttpCode(201)
  async publish(@Headers() h: RequestHeaders, @Param('id') id: string) {
    const actor = await this.auth(h, 'catalog.menu.write');
    return this.catalog.publish(parseUuid(id), h['if-match'], actor.id);
  }

  @Post('menus/:id/retire')
  @HttpCode(204)
  async retire(@Headers() h: RequestHeaders, @Param('id') id: string): Promise<void> {
    const actor = await this.auth(h, 'catalog.menu.write');
    await this.catalog.retire(parseUuid(id), h['if-match'], actor.id);
  }

  @Get('menus/:id/versions')
  async versions(@Headers() h: RequestHeaders, @Param('id') id: string) {
    await this.auth(h, 'catalog.audit.read');
    return { versions: await this.catalog.listVersions(parseUuid(id)) };
  }

  @Post('menus/:id/versions/:n/restore')
  @HttpCode(201)
  async restore(@Headers() h: RequestHeaders, @Param('id') id: string, @Param('n') n: string) {
    const actor = await this.auth(h, 'catalog.menu.write');
    return this.catalog.restore(parseUuid(id), parseVersionNumber(n), h['if-match'], actor.id);
  }

  // ----- Productos -----

  /** Lectura para quien gestiona la disponibilidad (personal y admin): necesita ver existencias. */
  @Get('products')
  async listProducts(@Headers() h: RequestHeaders) {
    await this.auth(h, 'catalog.availability.write');
    return { products: await this.catalog.listProducts() };
  }

  @Post('products')
  @HttpCode(201)
  async createProduct(@Headers() h: RequestHeaders, @Body() body: unknown) {
    const actor = await this.auth(h, 'catalog.menu.write');
    return this.catalog.createProduct(parseProductInput(body), actor.id);
  }

  @Put('products/:id')
  async updateProduct(
    @Headers() h: RequestHeaders,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ResLike,
  ) {
    const actor = await this.auth(h, 'catalog.menu.write');
    return this.etag(
      res,
      await this.catalog.updateProduct(
        parseUuid(id),
        h['if-match'],
        actor.id,
        parseProductInput(body),
      ),
    );
  }

  /** Personal y administradores. El parser rechaza cualquier campo que no sea disponibilidad/existencias. */
  @Patch('products/:id/availability')
  async availability(@Headers() h: RequestHeaders, @Param('id') id: string, @Body() body: unknown) {
    const actor = await this.auth(h, 'catalog.availability.write');
    return this.catalog.setAvailability(parseUuid(id), actor.id, parseAvailabilityPatch(body));
  }
}
