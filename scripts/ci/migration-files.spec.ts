import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMigrationOrder } from '../../apps/api/src/database/migration-files.js';

test('sorts timestamped migrations in deterministic order', () => {
  assert.deepEqual(
    validateMigrationOrder(['20261115120001_add_catalog.ts', '20261115090000_create_core.ts']),
    [
      { name: '20261115090000_create_core.ts', prefix: '20261115090000' },
      { name: '20261115120001_add_catalog.ts', prefix: '20261115120001' },
    ],
  );
});

test('rejects malformed names and duplicate timestamp prefixes', () => {
  assert.throws(() => validateMigrationOrder(['create_core.sql']), /YYYYMMDDHHMMSS_description/);
  assert.throws(
    () =>
      validateMigrationOrder(['20261115120001_add_catalog.ts', '20261115120001_add_customers.ts']),
    /Duplicate migration prefix/,
  );
});
