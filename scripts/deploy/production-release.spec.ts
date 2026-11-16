import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateProductionReleasePolicy,
  type ProductionReleasePolicy,
} from './deployment-contract.js';

const validPolicy: ProductionReleasePolicy = {
  environment: 'production',
  requiredApprovals: 1,
  concurrencyGroup: 'production-release',
  cancelInProgress: false,
  serviceOrder: ['api', 'worker', 'web'],
  previousDeploymentId: 'release-previous',
  rollbackOf: 'release-previous',
};

test('production release policy requires approval, serialization, backend-first order and linked rollback', () => {
  assert.deepEqual(validateProductionReleasePolicy(validPolicy), []);
});

test('rejects production release policies that bypass safety controls', () => {
  assert.deepEqual(
    validateProductionReleasePolicy({
      ...validPolicy,
      environment: 'staging',
      requiredApprovals: 0,
      concurrencyGroup: '',
      cancelInProgress: true,
      serviceOrder: ['web', 'api', 'worker'],
      rollbackOf: 'unrelated-release',
    }),
    [
      'production environment is required',
      'at least one human approval is required',
      'production release concurrency group is required',
      'an in-progress production release must not be cancelled by a newer release',
      'API and worker must be deployed before web',
      'rollback must link to the retained previous deployment',
    ],
  );
});
