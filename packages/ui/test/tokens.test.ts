import { describe, expect, it } from 'vitest';
import { designTokens } from '../src/index.js';

describe('shared UI token package', () => {
  it('exports the accessible base palette', () => {
    expect(designTokens.color.ink).toBe('#111111');
    expect(designTokens.color.paper).toBe('#ffffff');
    expect(designTokens.color.accent).toBe('#064e3b');
  });
});
