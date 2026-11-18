import { Inject, Injectable } from '@nestjs/common';
import { buildSnapshot } from '../domain/menu-snapshot';
import { ALLERGENS } from '../domain/allergens';
import { CatalogError } from '../domain/errors';
import type { AvailabilityPatch, ProductInput } from '../domain/input';
import {
  composePublicView,
  type LiveAvailability,
  type PublicMenu,
  type PublishedMenu,
} from '../domain/public-view';
import { DEFAULT_TIMEZONE, type ScheduleSlot } from '../domain/schedule';
import { CatalogRepository } from '../infrastructure/catalog.repository';
import { PublicCache } from '../infrastructure/public-cache';

export interface PublicQuery {
  categoryId?: string | undefined;
  excludeAllergens?: readonly string[] | undefined;
}

interface PublicBase {
  menus: PublishedMenu[];
  live: [string, LiveAvailability][];
}

export interface PurchasableProduct {
  productId: string;
  menuVersionId: string;
  name: string;
  description: string;
  unitPrice: { amountMinor: number; currency: 'USD' };
  allergens: string[];
  available: boolean;
}

export function resolveTimeZone(raw: string | undefined = process.env.CAFETERIA_TIMEZONE): string {
  if (!raw) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw });
    return raw;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

@Injectable()
export class CatalogService {
  readonly timeZone = resolveTimeZone();

  constructor(
    @Inject(CatalogRepository) private readonly repo: CatalogRepository,
    @Inject(PublicCache) private readonly cache: PublicCache,
  ) {}

  // ---------- Público ----------

  private async base(): Promise<PublicBase> {
    return this.cache.read(async () => ({
      menus: await this.repo.listPublished(),
      live: await this.repo.liveAvailability(),
    }));
  }

  async publicMenus(query: PublicQuery, now = new Date()) {
    const { menus, live } = await this.base();
    return {
      generatedAt: now.toISOString(),
      timezone: this.timeZone,
      allergens: ALLERGENS,
      menus: composePublicView(menus, new Map(live), {
        now,
        timeZone: this.timeZone,
        categoryId: query.categoryId,
        excludeAllergens: query.excludeAllergens,
      }),
    };
  }

  /** Contrato para Cart/Orders: precio base de la versión publicada vigente (sin promociones). */
  async purchasableProduct(productId: string, now = new Date()): Promise<PurchasableProduct> {
    const { menus, live } = await this.base();
    const view = composePublicView(menus, new Map(live), { now, timeZone: this.timeZone });
    const versionByMenu = new Map(menus.map((m) => [m.menuId, m.versionId]));
    const candidates = view.flatMap((menu) =>
      menu.categories.flatMap((c) =>
        c.products.filter((p) => p.productId === productId).map((p) => ({ menu, p })),
      ),
    );
    const found = candidates.find((x) => x.p.purchasable) ?? candidates[0];
    if (!found) throw new CatalogError('not_found', 'El producto no existe o no está publicado.');
    return {
      productId,
      menuVersionId: versionByMenu.get(found.menu.id) ?? '',
      name: found.p.name,
      description: found.p.description,
      unitPrice: found.p.unitPrice,
      allergens: found.p.allergens.map((a) => a.code),
      available: found.p.purchasable,
    };
  }

  // ---------- Administración ----------

  listMenus() {
    return this.repo.listMenus();
  }
  createMenu(name: string, actorId: string) {
    return this.repo.createMenu(name, actorId);
  }
  getDraft(menuId: string) {
    return this.repo.getDraft(menuId);
  }
  updateMenu(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    input: { name: string; schedule: ScheduleSlot[] },
  ) {
    return this.repo.updateMenu(menuId, ifMatch, actorId, input);
  }
  addCategory(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    name: string,
  ) {
    return this.repo.addCategory(menuId, ifMatch, actorId, name);
  }
  removeCategory(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    categoryId: string,
  ) {
    return this.repo.removeCategory(menuId, ifMatch, actorId, categoryId);
  }
  setCategoryItems(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    categoryId: string,
    productIds: string[],
  ) {
    return this.repo.setCategoryItems(menuId, ifMatch, actorId, categoryId, productIds);
  }

  /** Vista previa: el borrador tal como lo verá el cliente (sin horario, para poder revisarlo siempre). */
  async preview(menuId: string, now = new Date()): Promise<PublicMenu> {
    const draft = await this.repo.getDraft(menuId);
    const snapshot = buildSnapshot(menuId, { ...draft, schedule: [] });
    const live = new Map(await this.repo.liveAvailability());
    const [menu] = composePublicView(
      [{ menuId, versionId: 'preview', versionNumber: 0, snapshot }],
      live,
      { now, timeZone: this.timeZone },
    );
    if (!menu) throw new CatalogError('not_found', 'El menú no existe.');
    return { ...menu, availability: { ...menu.availability, schedule: draft.schedule } };
  }

  async publish(menuId: string, ifMatch: string | string[] | undefined, actorId: string) {
    const result = await this.repo.publish(menuId, ifMatch, actorId);
    await this.cache.invalidate();
    return result;
  }
  async restore(
    menuId: string,
    versionNumber: number,
    ifMatch: string | string[] | undefined,
    actorId: string,
  ) {
    const result = await this.repo.restore(menuId, versionNumber, ifMatch, actorId);
    await this.cache.invalidate();
    return result;
  }
  async retire(menuId: string, ifMatch: string | string[] | undefined, actorId: string) {
    await this.repo.retire(menuId, ifMatch, actorId);
    await this.cache.invalidate();
  }
  listVersions(menuId: string) {
    return this.repo.listVersions(menuId);
  }

  listProducts() {
    return this.repo.listProducts();
  }
  createProduct(input: ProductInput, actorId: string) {
    return this.repo.createProduct(input, actorId);
  }
  updateProduct(
    productId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    input: ProductInput,
  ) {
    return this.repo.updateProduct(productId, ifMatch, actorId, input);
  }
  async setAvailability(productId: string, actorId: string, patch: AvailabilityPatch) {
    const result = await this.repo.setAvailability(productId, actorId, patch);
    await this.cache.invalidate();
    return result;
  }
}
