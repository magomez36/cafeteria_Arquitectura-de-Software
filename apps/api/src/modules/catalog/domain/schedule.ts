export const DEFAULT_TIMEZONE = 'America/Guayaquil';

export interface ScheduleSlot {
  /** ISO: 1 = lunes … 7 = domingo. */
  dayOfWeek: number;
  /** HH:MM, hora local de la cafetería. */
  startsAt: string;
  /** HH:MM exclusivo. */
  endsAt: string;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function toMinutes(time: string): number {
  const match = TIME.exec(time);
  if (!match) throw new RangeError(`Hora inválida: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Devuelve la lista de errores (vacía si es válida). */
export function validateSchedule(slots: readonly ScheduleSlot[]): string[] {
  const errors: string[] = [];
  slots.forEach((slot, index) => {
    const at = `Franja ${index + 1}`;
    if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 1 || slot.dayOfWeek > 7) {
      errors.push(`${at}: el día debe ser un entero de 1 (lunes) a 7 (domingo).`);
    }
    if (!TIME.test(slot.startsAt) || !TIME.test(slot.endsAt)) {
      errors.push(`${at}: las horas deben tener el formato HH:MM.`);
    } else if (toMinutes(slot.endsAt) <= toMinutes(slot.startsAt)) {
      errors.push(
        `${at}: la hora de fin debe ser posterior a la de inicio (divida las franjas que cruzan la medianoche).`,
      );
    }
  });
  return errors;
}

export interface LocalTime {
  dayOfWeek: number;
  minutes: number;
}

export function localTime(instant: Date, timeZone: string = DEFAULT_TIMEZONE): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    dayOfWeek: WEEKDAYS[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Sin franjas = siempre vigente. Intervalo semiabierto [inicio, fin). */
export function isOpenAt(
  slots: readonly ScheduleSlot[],
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  if (slots.length === 0) return true;
  const now = localTime(instant, timeZone);
  return slots.some(
    (s) =>
      s.dayOfWeek === now.dayOfWeek &&
      toMinutes(s.startsAt) <= now.minutes &&
      now.minutes < toMinutes(s.endsAt),
  );
}

/**
 * Próximo instante (UTC, ISO) en que el menú empieza a estar vigente, dentro de 7 días.
 * `null` si está vigente de forma permanente o no hay franjas futuras.
 * Aritmética por minutos: exacta para zonas sin horario de verano (Ecuador continental).
 */
export function nextOpening(
  slots: readonly ScheduleSlot[],
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string | null {
  if (slots.length === 0) return null;
  const now = localTime(instant, timeZone);
  const minuteStart = Math.floor(instant.getTime() / 60_000) * 60_000;
  let best: number | null = null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = ((now.dayOfWeek - 1 + offset) % 7) + 1;
    for (const slot of slots) {
      if (slot.dayOfWeek !== day) continue;
      const start = toMinutes(slot.startsAt);
      if (offset === 0 && start <= now.minutes) continue;
      const delta = offset * 1440 + start - now.minutes;
      if (best === null || delta < best) best = delta;
    }
  }
  return best === null ? null : new Date(minuteStart + best * 60_000).toISOString();
}
