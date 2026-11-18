import { createMenuAction } from '@/features/catalog/admin/actions';
import { ActionForm } from '@/features/catalog/admin/components/action-form';
import { EmptyState, LoadFailure } from '@/features/catalog/admin/components/feedback';
import { TextField } from '@/features/catalog/admin/components/fields';
import { adminClient } from '@/features/catalog/admin/session';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  retired: 'Retirado',
};

export default async function AdminMenusPage() {
  const result = await (await adminClient()).listMenus();
  return (
    <>
      <h1>Menús</h1>
      {!result.ok ? (
        <LoadFailure failure={result} />
      ) : (
        <>
          {result.data.menus.length === 0 ? (
            <EmptyState>Todavía no hay menús. Cree el primero abajo.</EmptyState>
          ) : (
            <ul className="cat-list">
              {result.data.menus.map((menu) => (
                <li key={menu.id}>
                  <a href={`/admin/catalogo/${menu.id}`}>{menu.name}</a>{' '}
                  <span className="cat-badge">{STATUS_LABEL[menu.status] ?? menu.status}</span>
                </li>
              ))}
            </ul>
          )}
          <h2>Crear un menú</h2>
          <ActionForm action={createMenuAction} submitLabel="Crear menú">
            <TextField name="nombre" label="Nombre del menú" required />
          </ActionForm>
        </>
      )}
    </>
  );
}
