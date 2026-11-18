import { Controller, Get, Header, Inject, Param, Query, UseFilters } from '@nestjs/common';
import { CatalogService } from '../application/catalog.service';
import { parseAllergenList } from '../domain/allergens';
import { CatalogError } from '../domain/errors';
import { parseUuid } from '../domain/input';
import { CatalogErrorFilter } from './catalog-error.filter';

/** Lectura pública: solo versiones publicadas. No requiere sesión. */
@Controller('catalog')
@UseFilters(CatalogErrorFilter)
export class PublicMenuController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get('menus')
  @Header('Cache-Control', 'public, max-age=0, s-maxage=3')
  menus(@Query('category') category?: string, @Query('excludeAllergens') exclude?: string) {
    const excludeAllergens = parseAllergenList(typeof exclude === 'string' ? exclude : undefined);
    if (excludeAllergens === null) {
      throw new CatalogError('validation_failed', 'Alérgeno desconocido en «excludeAllergens».');
    }
    return this.catalog.publicMenus({
      categoryId: category === undefined ? undefined : parseUuid(category, 'category'),
      excludeAllergens,
    });
  }

  @Get('products/:productId')
  @Header('Cache-Control', 'public, max-age=0, s-maxage=3')
  product(@Param('productId') productId: string) {
    return this.catalog.purchasableProduct(parseUuid(productId, 'productId'));
  }
}
