import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workflowRunMetric, workflowRunRecord } from './publish.js';

test('emits sourced, team-level duration telemetry for an immutable workflow run', () => {
  const metric = workflowRunMetric({
    id: 42,
    name: 'Pull request CI',
    head_sha: 'a'.repeat(40),
    head_branch: 'feature/spec-1',
    conclusion: 'success',
    run_started_at: '2026-11-15T10:00:00.000Z',
    updated_at: '2026-11-15T10:02:30.000Z',
  });
  assert.equal(metric.value, 150);
  assert.equal(metric.unit, 'seconds');
  assert.deepEqual(metric.subject, { type: 'team' });
});

test('retains outcome and SHA, and classifies staging deployment telemetry', () => {
  const run = {
    id: 43,
    name: 'Staging deployment',
    head_sha: 'b'.repeat(40),
    head_branch: 'main',
    conclusion: 'success',
    run_started_at: '2026-11-15T10:00:00.000Z',
    updated_at: '2026-11-15T10:01:00.000Z',
  };
  const record = workflowRunRecord(run);
  assert.equal(record.result, 'success');
  assert.equal(record.sha, run.head_sha);
  assert.deepEqual(record.deployment, { environment: 'staging', sha: run.head_sha });
  assert.equal(record.metric.source, 'deployment');
});

test('rejects missing or reversed workflow timestamps', () => {
  assert.throws(
    () =>
      workflowRunMetric({
        id: 42,
        name: 'Pull request CI',
        head_sha: 'a'.repeat(40),
        head_branch: 'main',
        conclusion: 'success',
        run_started_at: 'bad',
        updated_at: '2026-11-15T10:00:00.000Z',
      }),
    /valid, ordered timestamps/,
  );
});
