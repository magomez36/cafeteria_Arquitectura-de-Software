import type { Metadata } from 'next';
import '@/features/catalog/catalog.css';

export const metadata: Metadata = {
  title: 'Administración del catálogo · Cafetería',
  robots: { index: false, follow: false },
};

export default function AdminCatalogLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="cat-page" id="contenido">
      <nav aria-label="Administración del catálogo">
        <ul className="cat-nav">
          <li>
            <a href="/admin/catalogo">Menús</a>
          </li>
          <li>
            <a href="/admin/catalogo/productos">Productos y disponibilidad</a>
          </li>
          <li>
            <a href="/menu">Ver tienda pública</a>
          </li>
        </ul>
      </nav>
      {children}
    </main>
  );
}
