import type { MenuSnapshot, SnapshotProduct } from './public-view';

export type VersionChange =
  | { type: 'menu_renamed'; from: string; to: string }
  | { type: 'schedule_changed' }
  | { type: 'category_added' | 'category_removed'; categoryId: string; name: string }
  | { type: 'category_renamed'; categoryId: string; from: string; to: string }
  | { type: 'product_added' | 'product_removed'; productId: string; name: string }
  | {
      type: 'product_changed';
      productId: string;
      name: string;
      field: 'name' | 'description' | 'priceMinor' | 'imageUrl' | 'imageAlt' | 'allergens';
      from: unknown;
      to: unknown;
    };

const FIELDS = [
  'name',
  'description',
  'priceMinor',
  'imageUrl',
  'imageAlt',
  'allergens',
] as const satisfies readonly (keyof SnapshotProduct)[];

const sorted = (list: readonly string[]): string => JSON.stringify([...list].sort());

/** Qué cambió entre dos versiones (`previous = null` en la primera publicación). */
export function diffSnapshots(previous: MenuSnapshot | null, next: MenuSnapshot): VersionChange[] {
  const changes: VersionChange[] = [];
  if (previous && previous.menu.name !== next.menu.name) {
    changes.push({ type: 'menu_renamed', from: previous.menu.name, to: next.menu.name });
  }
  if (previous && JSON.stringify(previous.menu.schedule) !== JSON.stringify(next.menu.schedule)) {
    changes.push({ type: 'schedule_changed' });
  }

  const prevCategories = new Map((previous?.categories ?? []).map((c) => [c.id, c]));
  const nextCategories = new Map(next.categories.map((c) => [c.id, c]));
  for (const [id, c] of nextCategories) {
    const before = prevCategories.get(id);
    if (!before) changes.push({ type: 'category_added', categoryId: id, name: c.name });
    else if (before.name !== c.name) {
      changes.push({ type: 'category_renamed', categoryId: id, from: before.name, to: c.name });
    }
  }
  for (const [id, c] of prevCategories) {
    if (!nextCategories.has(id)) {
      changes.push({ type: 'category_removed', categoryId: id, name: c.name });
    }
  }

  const flatten = (s: MenuSnapshot | null): Map<string, SnapshotProduct> =>
    new Map((s?.categories ?? []).flatMap((c) => c.products).map((p) => [p.productId, p]));
  const prevProducts = flatten(previous);
  const nextProducts = flatten(next);
  for (const [id, p] of nextProducts) {
    const before = prevProducts.get(id);
    if (!before) {
      changes.push({ type: 'product_added', productId: id, name: p.name });
      continue;
    }
    for (const field of FIELDS) {
      const a = before[field];
      const b = p[field];
      const differs =
        field === 'allergens'
          ? sorted(a as readonly string[]) !== sorted(b as readonly string[])
          : a !== b;
      if (differs) {
        changes.push({
          type: 'product_changed',
          productId: id,
          name: p.name,
          field,
          from: a,
          to: b,
        });
      }
    }
  }
  for (const [id, p] of prevProducts) {
    if (!nextProducts.has(id))
      changes.push({ type: 'product_removed', productId: id, name: p.name });
  }
  return changes;
}
