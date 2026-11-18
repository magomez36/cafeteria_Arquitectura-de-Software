import { formatPrice } from '../format';
import type { PublicProduct } from '../types';
import { AvailabilityBadge } from './availability-badge';

export function ProductCard({
  product,
  menuAvailableNow,
}: Readonly<{ product: PublicProduct; menuAvailableNow: boolean }>) {
  const allergenText =
    product.allergens.length > 0
      ? product.allergens.map((a) => a.label).join(', ')
      : 'Sin alérgenos declarados';
  return (
    <article className="cat-card" aria-labelledby={`p-${product.productId}`}>
      {product.imageUrl ? (
        // <img> nativo: URLs externas del catálogo; el texto alternativo es obligatorio para publicar
        <img
          className="cat-card__image"
          src={product.imageUrl}
          alt={product.imageAlt}
          loading="lazy"
          width={320}
          height={200}
        />
      ) : null}
      <h4 id={`p-${product.productId}`} className="cat-card__name">
        {product.name}
      </h4>
      <p>{product.description}</p>
      <p className="cat-card__price">
        <span className="cat-visually-hidden">Precio: </span>
        {formatPrice(product.unitPrice.amountMinor)}
      </p>
      <p>
        <strong>Alérgenos:</strong> {allergenText}
      </p>
      <AvailabilityBadge product={product} menuAvailableNow={menuAvailableNow} />
    </article>
  );
}
