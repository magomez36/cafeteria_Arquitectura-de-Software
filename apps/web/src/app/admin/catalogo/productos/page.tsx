import {
  availabilityAction,
  createProductAction,
  updateProductAction,
} from '@/features/catalog/admin/actions';
import { ActionForm } from '@/features/catalog/admin/components/action-form';
import { EmptyState, LoadFailure } from '@/features/catalog/admin/components/feedback';
import { ProductFields } from '@/features/catalog/admin/components/fields';
import { adminClient } from '@/features/catalog/admin/session';
import { fetchPublicMenus } from '@/features/catalog/api';
import { formatPrice } from '@/features/catalog/format';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const [products, publicMenus] = await Promise.all([
    (await adminClient()).listProducts(),
    fetchPublicMenus([]),
  ]);
  const allergens = publicMenus.status === 'ok' ? publicMenus.data.allergens : [];

  return (
    <>
      <h1>Productos y disponibilidad</h1>
      {!products.ok ? (
        <LoadFailure failure={products} />
      ) : (
        <>
          <section aria-labelledby="h-disp">
            <h2 id="h-disp">Disponibilidad del día</h2>
            <p className="cat-muted">
              Marcar agotado o ajustar existencias se refleja en la tienda de inmediato. Con
              existencias en 0 el producto queda agotado automáticamente.
            </p>
            {products.data.products.length === 0 ? (
              <EmptyState>Todavía no hay productos.</EmptyState>
            ) : (
              <ul className="cat-list">
                {products.data.products.map((p) => (
                  <li key={p.productId} className="cat-block">
                    <h3>{p.name}</h3>
                    <p>
                      {formatPrice(p.priceMinor)} ·{' '}
                      <strong>{p.availability === 'sold_out' ? 'Agotado' : 'Disponible'}</strong> ·{' '}
                      {p.stockQuantity === null
                        ? 'sin control de existencias'
                        : `${p.stockQuantity} en existencia`}
                    </p>
                    <ActionForm action={availabilityAction} submitLabel="Actualizar disponibilidad">
                      <input type="hidden" name="producto" value={p.productId} />
                      <p className="cat-field">
                        <label htmlFor={`disp-${p.productId}`}>Disponibilidad</label>
                        <select
                          id={`disp-${p.productId}`}
                          name="disponibilidad"
                          defaultValue={p.availability}
                        >
                          <option value="available">Disponible</option>
                          <option value="sold_out">Agotado</option>
                        </select>
                      </p>
                      <p className="cat-field">
                        <label htmlFor={`stock-${p.productId}`}>Existencias (opcional)</label>
                        <input
                          id={`stock-${p.productId}`}
                          name="existencias"
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          defaultValue={p.stockQuantity ?? ''}
                        />
                      </p>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="h-prod">
            <h2 id="h-prod">Contenido de los productos</h2>
            <p className="cat-muted">
              Solo administradores. Los cambios quedan en el borrador y llegan a la tienda al
              publicar el menú; el precio de cada pedido se fija con la versión publicada.
            </p>
            {products.data.products.map((p) => (
              <details key={p.productId} className="cat-block">
                <summary>Editar «{p.name}»</summary>
                <ActionForm action={updateProductAction} submitLabel="Guardar producto">
                  <input type="hidden" name="producto" value={p.productId} />
                  <input type="hidden" name="etag" value={`W/"${p.revision}"`} />
                  <ProductFields product={p} allergens={allergens} />
                </ActionForm>
              </details>
            ))}
            <h3>Crear producto</h3>
            <ActionForm action={createProductAction} submitLabel="Crear producto">
              <ProductFields allergens={allergens} />
            </ActionForm>
          </section>
        </>
      )}
    </>
  );
}
