'use client';

export default function AdminCatalogError({
  reset,
}: Readonly<{ error: Error; reset: () => void }>) {
  return (
    <div role="alert" className="cat-notice cat-notice--error">
      <h2>Algo salió mal al mostrar esta página</h2>
      <p>No se perdió ningún dato. Inténtelo de nuevo.</p>
      <button type="button" className="cat-button" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}
