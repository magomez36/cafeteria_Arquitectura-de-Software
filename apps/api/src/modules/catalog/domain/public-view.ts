import { allergenLabel } from './allergens';
import type { Money } from './money';
import { isOpenAt, nextOpening, type ScheduleSlot } from './schedule';

export interface SnapshotProduct {
  productId: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: 'USD';
  imageUrl: string | null;
  imageAlt: string;
  allergens: readonly string[];
}

export interface SnapshotCategory {
  id: string;
  name: string;
  position: number;
  products: readonly SnapshotProduct[];
}

export interface MenuSnapshot {
  menu: { id: string; name: string; schedule: readonly ScheduleSlot[] };
  categories: readonly SnapshotCategory[];
}

export interface PublishedMenu {
  menuId: string;
  versionId: string;
  versionNumber: number;
  snapshot: MenuSnapshot;
}

/** Estado operativo vivo (no versionado). */
export interface LiveAvailability {
  availability: 'available' | 'sold_out';
  stockQuantity: number | null;
}

export interface PublicProduct {
  productId: string;
  name: string;
  description: string;
  unitPrice: Money;
  imageUrl: string | null;
  imageAlt: string;
  allergens: { code: string; label: string }[];
  availability: 'available' | 'sold_out';
  purchasable: boolean;
}

export interface PublicMenu {
  id: string;
  name: string;
  versionNumber: number;
  availability: {
    availableNow: boolean;
    nextAvailableAt: string | null;
    schedule: readonly ScheduleSlot[];
  };
  notice: string | null;
  categories: { id: string; name: string; products: PublicProduct[] }[];
}

export interface PublicViewOptions {
  now: Date;
  timeZone: string;
  categoryId?: string;
  excludeAllergens?: readonly string[];
}

const NO_PRODUCTS_NOTICE = 'No hay productos disponibles en este momento.';

function effectiveAvailability(live: LiveAvailability | undefined): 'available' | 'sold_out' {
  if (!live) return 'sold_out';
  if (live.availability === 'sold_out') return 'sold_out';
  if (live.stockQuantity !== null && live.stockQuantity <= 0) return 'sold_out';
  return 'available';
}

const normalize = (name: string): string => name.trim().toLocaleLowerCase('es');

/**
 * Compone la vista pública. Solo recibe versiones publicadas: los borradores no llegan aquí.
 * Los menús vigentes van primero; un producto aparece una sola vez por categoría entre menús vigentes.
 */
export function composePublicView(
  menus: readonly PublishedMenu[],
  live: ReadonlyMap<string, LiveAvailability>,
  options: PublicViewOptions,
): PublicMenu[] {
  const exclude = new Set(options.excludeAllergens ?? []);
  const seen = new Set<string>();

  return orderForDisplay(menus, options.now, options.timeZone).map((published) => {
    const { snapshot } = published;
    const schedule = snapshot.menu.schedule;
    const availableNow = isOpenAt(schedule, options.now, options.timeZone);

    const categories = snapshot.categories
      .filter((c) => !options.categoryId || c.id === options.categoryId)
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((category) => {
        const products: PublicProduct[] = [];
        for (const p of category.products) {
          if (p.allergens.some((a) => exclude.has(a))) continue;
          if (availableNow) {
            const key = `${normalize(category.name)}|${p.productId}`;
            if (seen.has(key)) continue;
            seen.add(key);
          }
          const availability = effectiveAvailability(live.get(p.productId));
          products.push({
            productId: p.productId,
            name: p.name,
            description: p.description,
            unitPrice: { amountMinor: p.priceMinor, currency: p.currency },
            imageUrl: p.imageUrl,
            imageAlt: p.imageAlt,
            allergens: p.allergens.map((code) => ({ code, label: allergenLabel(code) })),
            availability,
            purchasable: availableNow && availability === 'available',
          });
        }
        return { id: category.id, name: category.name, products };
      })
      .filter((c) => c.products.length > 0);

    const anyPurchasable = categories.some((c) => c.products.some((p) => p.purchasable));
    const menu: PublicMenu = {
      id: published.menuId,
      name: snapshot.menu.name,
      versionNumber: published.versionNumber,
      availability: {
        availableNow,
        nextAvailableAt: availableNow ? null : nextOpening(schedule, options.now, options.timeZone),
        schedule,
      },
      notice: anyPurchasable ? null : NO_PRODUCTS_NOTICE,
      categories,
    };
    return menu;
  });
}

/** Orden estable: vigentes primero, luego por nombre. Aplicar ANTES de `composePublicView`. */
export function orderForDisplay(
  menus: readonly PublishedMenu[],
  now: Date,
  timeZone: string,
): PublishedMenu[] {
  return menus
    .map((m) => ({ m, open: isOpenAt(m.snapshot.menu.schedule, now, timeZone) }))
    .sort(
      (a, b) =>
        Number(b.open) - Number(a.open) ||
        a.m.snapshot.menu.name.localeCompare(b.m.snapshot.menu.name, 'es'),
    )
    .map((x) => x.m);
}
