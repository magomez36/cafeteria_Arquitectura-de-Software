import type { MenuSnapshot } from './public-view';
import type { DraftMenu } from './publish-validation';

/**
 * Construye la instantánea inmutable a partir de un borrador ya validado.
 * Copia profunda: modificar el borrador después no altera la versión publicada.
 */
export function buildSnapshot(menuId: string, draft: DraftMenu): MenuSnapshot {
  return {
    menu: {
      id: menuId,
      name: draft.name.trim(),
      schedule: draft.schedule.map((s) => ({ ...s })),
    },
    categories: draft.categories.map((category, position) => ({
      id: category.categoryId,
      name: category.name.trim(),
      position,
      products: category.products.map((p) => ({
        productId: p.productId,
        name: p.name.trim(),
        description: p.description.trim(),
        priceMinor: p.priceMinor,
        currency: 'USD' as const,
        imageUrl: p.imageUrl,
        imageAlt: (p.imageAlt ?? '').trim(),
        allergens: [...p.allergens],
      })),
    })),
  };
}
