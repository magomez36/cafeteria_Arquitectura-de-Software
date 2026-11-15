import { describe, expect, it } from 'vitest';
describe('home page foundation', () => { it('has a platform landing page module', async () => { const page = await import('./page'); expect(page.default).toBeTypeOf('function'); }); });
