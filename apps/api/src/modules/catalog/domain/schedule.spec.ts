import { isOpenAt, nextOpening, validateSchedule, type ScheduleSlot } from './schedule';

// Ecuador = UTC-5 todo el año. 2026-11-16 es lunes.
const breakfast: ScheduleSlot[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startsAt: '07:00',
  endsAt: '11:00',
}));
const at = (iso: string): Date => new Date(iso);

describe('schedule', () => {
  it('sin franjas siempre está vigente y no tiene próxima apertura', () => {
    expect(isOpenAt([], at('2026-11-16T12:00:00Z'))).toBe(true);
    expect(nextOpening([], at('2026-11-16T12:00:00Z'))).toBeNull();
  });

  it('usa la hora local de la cafetería, no UTC', () => {
    expect(isOpenAt(breakfast, at('2026-11-16T12:00:00Z'))).toBe(true); // 07:00 local
    expect(isOpenAt(breakfast, at('2026-11-16T11:59:00Z'))).toBe(false); // 06:59 local
  });

  it('el fin es exclusivo', () => {
    expect(isOpenAt(breakfast, at('2026-11-16T15:59:00Z'))).toBe(true); // 10:59
    expect(isOpenAt(breakfast, at('2026-11-16T16:00:00Z'))).toBe(false); // 11:00
  });

  it('cambia de día según la zona (02:00Z lunes = domingo 21:00 local)', () => {
    const sunday: ScheduleSlot[] = [{ dayOfWeek: 7, startsAt: '20:00', endsAt: '22:00' }];
    expect(isOpenAt(sunday, at('2026-11-16T02:00:00Z'))).toBe(true);
  });

  it('no abre los fines de semana', () => {
    expect(isOpenAt(breakfast, at('2026-11-14T13:00:00Z'))).toBe(false); // sábado 08:00
  });

  it('calcula la próxima apertura el mismo día', () => {
    expect(nextOpening(breakfast, at('2026-11-16T10:00:00Z'))).toBe('2026-11-16T12:00:00.000Z');
  });

  it('salta al siguiente día hábil tras el cierre', () => {
    expect(nextOpening(breakfast, at('2026-11-16T17:00:00Z'))).toBe('2026-11-17T12:00:00.000Z');
  });

  it('salta el fin de semana (viernes tarde → lunes)', () => {
    expect(nextOpening(breakfast, at('2026-11-20T20:00:00Z'))).toBe('2026-11-23T12:00:00.000Z');
  });

  it('valida franjas', () => {
    expect(validateSchedule(breakfast)).toEqual([]);
    expect(validateSchedule([{ dayOfWeek: 8, startsAt: '07:00', endsAt: '11:00' }])).toHaveLength(
      1,
    );
    expect(validateSchedule([{ dayOfWeek: 1, startsAt: '11:00', endsAt: '07:00' }])).toHaveLength(
      1,
    );
    expect(validateSchedule([{ dayOfWeek: 1, startsAt: '7:00', endsAt: '11:00' }])).toHaveLength(1);
    expect(validateSchedule([{ dayOfWeek: 1, startsAt: '22:00', endsAt: '00:00' }])).toHaveLength(
      1,
    );
  });
});
