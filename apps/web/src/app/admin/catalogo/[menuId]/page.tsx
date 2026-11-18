import {
  addCategoryAction,
  publishAction,
  removeCategoryAction,
  retireAction,
  saveItemsAction,
  saveMenuAction,
} from '@/features/catalog/admin/actions';
import { ActionForm } from '@/features/catalog/admin/components/action-form';
import { LoadFailure } from '@/features/catalog/admin/components/feedback';
import { MenuHidden, ScheduleFields, TextField } from '@/features/catalog/admin/components/fields';
import { VersionHistory } from '@/features/catalog/admin/components/version-history';
import { adminClient } from '@/features/catalog/admin/session';

export const dynamic = 'force-dynamic';

export default async function MenuEditorPage({
  params,
}: Readonly<{ params: Promise<{ menuId: string }> }>) {
  const { menuId } = await params;
  const client = await adminClient();
  const [menu, products, versions] = await Promise.all([
    client.getMenu(menuId),
    client.listProducts(),
    client.listVersions(menuId),
  ]);

  if (!menu.ok) return <LoadFailure failure={menu} />;
  const etag = menu.etag ?? '';
  const draft = menu.data;
  const canPublish = draft.status !== 'retired';

  return (
    <>
      <h1>Editar menú: {draft.name}</h1>
      <p role="status">
        Estado:{' '}
        <strong>
          {{ draft: 'Borrador', published: 'Publicado', retired: 'Retirado' }[draft.status]}
        </strong>
        {draft.currentVersionNumber ? ` · versión publicada ${draft.currentVersionNumber}` : ''}. Lo
        que edita aquí es un borrador: los clientes no lo ven hasta que lo publique.
      </p>

      <section aria-labelledby="h-datos">
        <h2 id="h-datos">Nombre y horario</h2>
        <ActionForm action={saveMenuAction} submitLabel="Guardar borrador">
          <MenuHidden menuId={draft.id} etag={etag} />
          <TextField name="nombre" label="Nombre del menú" defaultValue={draft.name} required />
          <ScheduleFields slots={draft.schedule} />
        </ActionForm>
      </section>

      <section aria-labelledby="h-cats">
        <h2 id="h-cats">Categorías y productos</h2>
        {draft.categories.length === 0 ? (
          <p role="status">Este menú no tiene categorías. Añada la primera.</p>
        ) : null}
        {draft.categories.map((cat) => {
          const inCategory = new Set(cat.products.map((p) => p.productId));
          return (
            <div key={cat.categoryId} className="cat-block">
              <h3>{cat.name}</h3>
              {products.ok ? (
                products.data.products.length === 0 ? (
                  <p role="status">
                    No hay productos. <a href="/admin/catalogo/productos">Cree productos</a>{' '}
                    primero.
                  </p>
                ) : (
                  <ActionForm
                    action={saveItemsAction}
                    submitLabel="Guardar productos de la categoría"
                  >
                    <MenuHidden menuId={draft.id} etag={etag} />
                    <input type="hidden" name="categoria" value={cat.categoryId} />
                    <fieldset className="cat-fieldset">
                      <legend>Productos en «{cat.name}»</legend>
                      <ul className="cat-filter__list">
                        {products.data.products.map((p) => (
                          <li key={p.productId}>
                            <input
                              type="checkbox"
                              id={`${cat.categoryId}-${p.productId}`}
                              name="productos"
                              value={p.productId}
                              defaultChecked={inCategory.has(p.productId)}
                            />
                            <label htmlFor={`${cat.categoryId}-${p.productId}`}>{p.name}</label>
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                  </ActionForm>
                )
              ) : (
                <LoadFailure failure={products} />
              )}
              <ActionForm
                action={removeCategoryAction}
                submitLabel={`Quitar la categoría «${cat.name}»`}
                secondary
                confirmText={`¿Quitar la categoría «${cat.name}» del borrador?`}
              >
                <MenuHidden menuId={draft.id} etag={etag} />
                <input type="hidden" name="categoria" value={cat.categoryId} />
              </ActionForm>
            </div>
          );
        })}
        <h3>Añadir categoría</h3>
        <ActionForm action={addCategoryAction} submitLabel="Añadir categoría">
          <MenuHidden menuId={draft.id} etag={etag} />
          <TextField name="nombre" label="Nombre de la categoría" required />
        </ActionForm>
      </section>

      <section aria-labelledby="h-pub">
        <h2 id="h-pub">Previsualizar y publicar</h2>
        <p>
          <a
            className="cat-button cat-button--secondary"
            href={`/admin/catalogo/${draft.id}/vista-previa`}
          >
            Ver cómo quedará (vista previa)
          </a>
        </p>
        {canPublish ? (
          <ActionForm action={publishAction} submitLabel="Publicar menú">
            <MenuHidden menuId={draft.id} etag={etag} />
            <p className="cat-muted">
              Se publica solo si todos los productos tienen texto alternativo en su imagen y los
              alérgenos revisados.
            </p>
          </ActionForm>
        ) : (
          <p role="status">Este menú está retirado y no se puede publicar.</p>
        )}
        {draft.status === 'published' ? (
          <ActionForm
            action={retireAction}
            submitLabel="Retirar de la tienda"
            secondary
            confirmText="Los clientes dejarán de ver este menú. Las versiones se conservan. ¿Retirarlo?"
          >
            <MenuHidden menuId={draft.id} etag={etag} />
          </ActionForm>
        ) : null}
      </section>

      <section aria-labelledby="h-hist">
        <h2 id="h-hist">Historial de versiones</h2>
        {versions.ok ? (
          <VersionHistory
            menuId={draft.id}
            etag={etag}
            versions={versions.data.versions}
            canRestore={canPublish}
          />
        ) : (
          <LoadFailure failure={versions} />
        )}
      </section>
    </>
  );
}
