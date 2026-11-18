import type { PublicAllergen } from '../types';

/**
 * Formulario GET nativo: funciona con teclado, lector de pantalla y sin JavaScript.
 * Cada casilla mide ≥44 px; la selección se conserva al recargar.
 */
export function AllergenFilter({
  allergens,
  excluded,
  action = '/menu',
}: Readonly<{ allergens: PublicAllergen[]; excluded: readonly string[]; action?: string }>) {
  return (
    <form method="get" action={action} className="cat-filter">
      <fieldset>
        <legend>Excluir productos con estos alérgenos</legend>
        <ul className="cat-filter__list">
          {allergens.map((allergen) => {
            const id = `excluir-${allergen.code}`;
            return (
              <li key={allergen.code}>
                <input
                  type="checkbox"
                  id={id}
                  name="excluir"
                  value={allergen.code}
                  defaultChecked={excluded.includes(allergen.code)}
                />
                <label htmlFor={id}>{allergen.label}</label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <div className="cat-filter__actions">
        <button type="submit" className="cat-button">
          Aplicar filtro
        </button>
        {excluded.length > 0 ? (
          <a href={action} className="cat-button cat-button--secondary">
            Quitar filtro
          </a>
        ) : null}
      </div>
    </form>
  );
}
