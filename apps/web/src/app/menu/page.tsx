import type { Metadata } from 'next';
import { fetchPublicMenus } from '@/features/catalog/api';
import { AllergenFilter } from '@/features/catalog/components/allergen-filter';
import { MenuView } from '@/features/catalog/components/menu-view';
import { parseExcluded } from '@/features/catalog/format';

export const metadata: Metadata = {
  title: 'Menú · Cafetería',
  description: 'Menú vigente con precios, alérgenos y disponibilidad.',
};

export default async function MenuPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const excluded = parseExcluded((await searchParams).excluir);
  const result = await fetchPublicMenus(excluded);

  return (
    <main className="cat-page" id="contenido">
      <h1>Menú</h1>
      {result.status === 'error' ? (
        <p role="alert">
          No pudimos cargar el menú. Inténtelo de nuevo en unos segundos; si el problema continúa,
          consulte en el mostrador.
        </p>
      ) : null}
      {result.status === 'invalid-filter' ? (
        <p role="alert">
          El filtro de alérgenos no es válido. <a href="/menu">Quitar el filtro</a> e intentarlo de
          nuevo.
        </p>
      ) : null}
      {result.status === 'ok' ? (
        <>
          <AllergenFilter allergens={result.data.allergens} excluded={excluded} />
          {excluded.length > 0 ? (
            <p role="status" className="cat-muted">
              Mostrando solo productos sin: {excluded.join(', ').replaceAll('_', ' ')}.
            </p>
          ) : null}
          {result.data.menus.length === 0 ? (
            <p role="status">Todavía no hay un menú publicado. Vuelva a consultar más tarde.</p>
          ) : (
            result.data.menus.map((menu) => (
              <MenuView key={menu.id} menu={menu} timeZone={result.data.timezone} />
            ))
          )}
        </>
      ) : null}
    </main>
  );
}
