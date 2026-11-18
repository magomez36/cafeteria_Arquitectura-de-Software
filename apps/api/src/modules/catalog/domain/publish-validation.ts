import { isAllergenCode } from './allergens';
import { isValidPriceMinor } from './money';
import { validateSchedule, type ScheduleSlot } from './schedule';

export interface DraftProduct {
  productId: string;
  name: string;
  description: string;
  priceMinor: number;
  imageUrl: string | null;
  imageAlt: string | null;
  allergens: readonly string[];
  allergensDeclared: boolean;
}

export interface DraftCategory {
  categoryId: string;
  name: string;
  products: readonly DraftProduct[];
}

export interface DraftMenu {
  name: string;
  schedule: readonly ScheduleSlot[];
  categories: readonly DraftCategory[];
}

export interface PublishIssue {
  path: string;
  message: string;
}

/** FR-004 / SC-005: nada se publica sin texto alternativo ni información de alérgenos. */
export function validateForPublish(menu: DraftMenu): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (!menu.name.trim()) issues.push({ path: 'menu.name', message: 'El menú necesita un nombre.' });

  for (const message of validateSchedule(menu.schedule)) {
    issues.push({ path: 'menu.schedule', message });
  }

  const total = menu.categories.reduce((n, c) => n + c.products.length, 0);
  if (total === 0) {
    issues.push({ path: 'menu.categories', message: 'El menú debe tener al menos un producto.' });
  }

  for (const category of menu.categories) {
    if (!category.name.trim()) {
      issues.push({
        path: `category:${category.categoryId}`,
        message: 'La categoría necesita un nombre.',
      });
    }
    for (const p of category.products) {
      const at = `product:${p.productId}`;
      const label = `«${p.name || p.productId}»`;
      if (!p.name.trim() || !p.description.trim()) {
        issues.push({ path: at, message: `${label} necesita nombre y descripción.` });
      }
      if (!isValidPriceMinor(p.priceMinor)) {
        issues.push({ path: at, message: `${label} tiene un precio inválido.` });
      }
      if (p.imageUrl && !p.imageAlt?.trim()) {
        issues.push({
          path: at,
          message: `${label} tiene imagen pero le falta el texto alternativo.`,
        });
      }
      if (!p.imageAlt?.trim()) {
        issues.push({ path: at, message: `${label} necesita texto alternativo de la imagen.` });
      }
      if (!p.allergensDeclared) {
        issues.push({
          path: at,
          message: `${label} no tiene información de alérgenos (indique los alérgenos o «sin alérgenos»).`,
        });
      }
      if (!p.allergens.every(isAllergenCode)) {
        issues.push({ path: at, message: `${label} contiene alérgenos desconocidos.` });
      }
    }
  }
  return issues;
}
