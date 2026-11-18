import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDeploymentRecord, type DeploymentRecord } from './deployment-contract.js';

const validRecord: DeploymentRecord = {
  deploymentId: 'deploy-123',
  environment: 'staging',
  sha: '0123456789abcdef0123456789abcdef01234567',
  artifact: {
    kind: 'container-image',
    digest: `sha256:${'a'.repeat(64)}`,
  },
  state: 'healthy',
  createdAt: '2026-11-15T12:00:00.000Z',
  updatedAt: '2026-11-15T12:01:00.000Z',
};

test('accepts an immutable deployment record with a valid SHA and lifecycle timestamps', () => {
  assert.deepEqual(validateDeploymentRecord(validRecord), []);
});

test('rejects mutable tags, invalid SHA, invalid states, and malformed timestamps', () => {
  const invalidRecord: DeploymentRecord = {
    ...validRecord,
    sha: 'feature/latest',
    artifact: { kind: 'container-image', digest: 'ghcr.io/example/api:latest' },
    state: 'unknown' as DeploymentRecord['state'],
    createdAt: 'yesterday',
    updatedAt: '2026-11-14T12:00:00.000Z',
  };

  assert.deepEqual(validateDeploymentRecord(invalidRecord), [
    'sha must be a 40-character hexadecimal commit SHA',
    'artifact digest must use the immutable sha256:<64 hexadecimal characters> form',
    'deployment state is invalid',
    'createdAt must be an ISO 8601 UTC timestamp',
  ]);
});

test('rejects lifecycle timestamps that move backwards', () => {
  const invalidTimestamps = {
    ...validRecord,
    createdAt: '2026-11-15T12:01:00.000Z',
    updatedAt: '2026-11-15T12:00:00.000Z',
  };
  assert.deepEqual(validateDeploymentRecord(invalidTimestamps), [
    'updatedAt must not precede createdAt',
  ]);
});

test('requires a rollback record to identify the deployment it replaces', () => {
  const rollback: DeploymentRecord = { ...validRecord, state: 'rolled_back', rollbackOf: ' ' };
  assert.deepEqual(validateDeploymentRecord(rollback), [
    'rollbackOf is required for rolled_back deployments',
  ]);
});
