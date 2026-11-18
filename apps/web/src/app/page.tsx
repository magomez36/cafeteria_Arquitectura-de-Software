export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <main id="contenido" tabIndex={-1}>
        <h1>Cafetería</h1>
        <p>La plataforma está lista para el equipo.</p>
      </main>
    </>
  );
}
