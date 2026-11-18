/** Lista cerrada de alérgenos. Pendiente de validar contra la normativa de etiquetado de Ecuador. */
export const ALLERGENS = [
  { code: 'gluten', label: 'Cereales con gluten' },
  { code: 'crustaceos', label: 'Crustáceos' },
  { code: 'huevo', label: 'Huevo' },
  { code: 'pescado', label: 'Pescado' },
  { code: 'mani', label: 'Maní' },
  { code: 'soya', label: 'Soya' },
  { code: 'leche', label: 'Leche y lácteos' },
  { code: 'frutos_secos', label: 'Frutos secos' },
  { code: 'apio', label: 'Apio' },
  { code: 'mostaza', label: 'Mostaza' },
  { code: 'sesamo', label: 'Sésamo' },
  { code: 'sulfitos', label: 'Sulfitos' },
  { code: 'moluscos', label: 'Moluscos' },
  { code: 'altramuces', label: 'Altramuces' },
] as const;

export type AllergenCode = (typeof ALLERGENS)[number]['code'];

const CODES: ReadonlySet<string> = new Set(ALLERGENS.map((a) => a.code));

export function isAllergenCode(value: string): value is AllergenCode {
  return CODES.has(value);
}

export function allergenLabel(code: string): string {
  return ALLERGENS.find((a) => a.code === code)?.label ?? code;
}

/** Parsea `a,b,c`. Devuelve `null` si algún código es desconocido. */
export function parseAllergenList(raw: string | undefined): AllergenCode[] | null {
  if (raw === undefined || raw.trim() === '') return [];
  const codes = raw.split(',').map((c) => c.trim());
  if (!codes.every(isAllergenCode)) return null;
  return [...new Set(codes)] as AllergenCode[];
}
