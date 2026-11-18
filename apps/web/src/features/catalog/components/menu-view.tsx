import { formatNextOpening } from '../format';
import type { PublicMenu } from '../types';
import { ProductCard } from './product-card';

export function MenuView({ menu, timeZone }: Readonly<{ menu: PublicMenu; timeZone: string }>) {
  const { availableNow, nextAvailableAt } = menu.availability;
  const headingId = `menu-${menu.id}`;
  return (
    <section aria-labelledby={headingId} className="cat-menu">
      <h2 id={headingId}>{menu.name}</h2>
      {availableNow ? (
        <p className="cat-menu__status">Disponible ahora.</p>
      ) : (
        <p className="cat-menu__status cat-menu__status--closed">
          Este menú no está disponible en este momento.
          {nextAvailableAt
            ? ` Estará disponible desde el ${formatNextOpening(nextAvailableAt, timeZone)}.`
            : ''}
        </p>
      )}
      {menu.notice ? <p role="status">{menu.notice}</p> : null}
      {menu.categories.length > 1 ? (
        <nav aria-label={`Categorías de ${menu.name}`}>
          <ul className="cat-nav">
            {menu.categories.map((category) => (
              <li key={category.id}>
                <a href={`#cat-${menu.id}-${category.id}`}>{category.name}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {menu.categories.map((category) => (
        <section
          key={category.id}
          id={`cat-${menu.id}-${category.id}`}
          aria-labelledby={`h-${menu.id}-${category.id}`}
        >
          <h3 id={`h-${menu.id}-${category.id}`}>{category.name}</h3>
          <ul className="cat-grid">
            {category.products.map((product) => (
              <li key={product.productId}>
                <ProductCard product={product} menuAvailableNow={availableNow} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
