import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeJob } from './report-workflow-run.mjs';

test('workflow job statuses normalize to the documented check states', () => {
  assert.equal(normalizeJob({ name: 'build', status: 'queued' }).status, 'queued');
  assert.equal(
    normalizeJob(
      { name: 'build', status: 'in_progress', started_at: '2026-11-15T00:00:00Z' },
      Date.parse('2026-11-15T00:00:04Z'),
    ).status,
    'in_progress',
  );
  assert.equal(
    normalizeJob({ name: 'build', status: 'completed', conclusion: 'success' }).status,
    'success',
  );
  assert.equal(
    normalizeJob({ name: 'build', status: 'completed', conclusion: 'failure' }).status,
    'failure',
  );
  assert.equal(
    normalizeJob({ name: 'build', status: 'completed', conclusion: 'cancelled' }).status,
    'cancelled',
  );
});

test('workflow job durations are calculated from actual start and completion timestamps', () => {
  const job = normalizeJob({
    name: 'quality',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-11-15T00:00:00Z',
    completed_at: '2026-11-15T00:00:12Z',
  });
  assert.equal(job.durationMs, 12000);
  assert.equal(normalizeJob({ name: 'queued', status: 'queued' }).durationMs, null);
});
