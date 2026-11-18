import { assertRevision, formatEtag, parseIfMatch } from './revision';

describe('revision', () => {
  it('formatea y parsea ETag débil y fuerte', () => {
    expect(formatEtag(3)).toBe('W/"3"');
    expect(parseIfMatch('W/"3"')).toBe(3);
    expect(parseIfMatch('"7"')).toBe(7);
    expect(parseIfMatch(['"9"'])).toBe(9);
  });

  it.each([undefined, '', '*', '3', 'W/"x"', '"-1"', '"1234567890"'])('rechaza %p', (v) => {
    expect(parseIfMatch(v)).toBeNull();
  });

  it('428 si falta If-Match', () => {
    expect(() => assertRevision(undefined, 1)).toThrow(
      expect.objectContaining({ code: 'precondition_required', status: 428 }),
    );
  });

  it('409 si la revisión no coincide (segundo administrador)', () => {
    expect(() => assertRevision('W/"1"', 2)).toThrow(
      expect.objectContaining({ code: 'conflict', status: 409 }),
    );
  });

  it('acepta la revisión vigente', () => {
    expect(assertRevision('W/"2"', 2)).toBe(2);
  });
});
