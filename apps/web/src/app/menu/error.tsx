'use client';

export default function MenuError({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  return (
    <main className="cat-page">
      <h1>Menú</h1>
      <p role="alert">Algo salió mal al mostrar el menú.</p>
      <button type="button" className="cat-button" onClick={reset}>
        Intentar de nuevo
      </button>
    </main>
  );
}
