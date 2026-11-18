import { describe, expect, it } from 'vitest';
import type { FeatureFlagKey } from '../src/index.js';

describe('feature flag package boundary', () => {
  it('accepts namespaced keys without implementing flag behavior in this phase', () => {
    const key: FeatureFlagKey = 'catalog.new-menu';
    expect(key).toContain('.');
  });
});
