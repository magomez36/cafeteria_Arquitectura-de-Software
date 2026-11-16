import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPostgresStartupTransientFailure } from './postgres-startup-retry.js';

test('recognizes only PostgreSQL readiness errors from a non-signalled failed process', () => {
  assert.equal(
    isPostgresStartupTransientFailure(1, null, 'error: the database system is starting up'),
    true,
  );
  assert.equal(isPostgresStartupTransientFailure(0, null, 'database system is starting up'), false);
  assert.equal(
    isPostgresStartupTransientFailure(1, 'SIGTERM', 'database system is starting up'),
    false,
  );
  assert.equal(isPostgresStartupTransientFailure(1, null, 'permission denied'), false);
});
