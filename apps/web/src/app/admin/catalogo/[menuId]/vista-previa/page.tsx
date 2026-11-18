import { LoadFailure } from '@/features/catalog/admin/components/feedback';
import { adminClient } from '@/features/catalog/admin/session';
import { MenuView } from '@/features/catalog/components/menu-view';

export const dynamic = 'force-dynamic';

export default async function MenuPreviewPage({
  params,
}: Readonly<{ params: Promise<{ menuId: string }> }>) {
  const { menuId } = await params;
  const result = await (await adminClient()).preview(menuId);
  return (
    <>
      <h1>Vista previa</h1>
      <p role="status" className="cat-notice">
        Así verán los clientes este borrador cuando lo publique. Todavía{' '}
        <strong>no es público</strong>.
      </p>
      <p>
        <a href={`/admin/catalogo/${menuId}`}>Volver al editor</a>
      </p>
      {result.ok ? (
        <MenuView menu={result.data} timeZone="America/Guayaquil" />
      ) : (
        <LoadFailure failure={result} />
      )}
    </>
  );
}
