/** Los importes viajan como enteros en centavos; solo se dividen para mostrarlos. */
export function formatPrice(amountMinor: number): string {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(
    amountMinor / 100,
  );
}

/** «lunes 17 de noviembre, 07:00» en la hora local de la cafetería. */
export function formatNextOpening(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

const CODE = /^[a-z_]{2,30}$/;

/** Normaliza `?excluir=a&excluir=b` de la URL; descarta valores que no parezcan códigos. */
export function parseExcluded(raw: string | string[] | undefined): string[] {
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.filter((code) => CODE.test(code)))];
}
