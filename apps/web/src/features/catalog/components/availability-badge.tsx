import type { PublicProduct } from '../types';

/** El estado se comunica con texto (y un símbolo decorativo), nunca solo con color (WCAG 1.4.1). */
export function AvailabilityBadge({
  product,
  menuAvailableNow,
}: Readonly<{ product: PublicProduct; menuAvailableNow: boolean }>) {
  if (product.availability === 'sold_out') {
    return (
      <p className="cat-badge cat-badge--soldout">
        <span aria-hidden="true">✕ </span>Agotado
      </p>
    );
  }
  if (!menuAvailableNow) {
    return (
      <p className="cat-badge cat-badge--closed">
        <span aria-hidden="true">◷ </span>Fuera de horario
      </p>
    );
  }
  return (
    <p className="cat-badge cat-badge--ok">
      <span aria-hidden="true">✓ </span>Disponible
    </p>
  );
}
