import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateProductionReleasePolicy,
  type ProductionReleasePolicy,
} from './deployment-contract.js';
import { rollOutRelease, type ImmutableRelease, type ReleaseDriver } from './release-rollout.js';

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

const repository = 'test/cafeteria';
function release(hex: string): ImmutableRelease {
  return {
    sha: hex.repeat(40),
    api: `ghcr.io/${repository}/api@sha256:${hex.repeat(64)}`,
    worker: `ghcr.io/${repository}/worker@sha256:${hex.repeat(64)}`,
    web: `dpl_${hex}`,
  };
}

function controlledDriver(
  arbitration: { migrationError?: boolean; unhealthy?: boolean; recoveryError?: boolean } = {},
) {
  const previous = release('a');
  const candidate = release('b');
  const live = { ...previous };
  const events: string[] = [];
  const driver: ReleaseDriver = {
    async readActive() {
      return previous;
    },
    async predeploy(image) {
      assert.equal(image, candidate.api);
      events.push('predeploy');
      if (arbitration.migrationError) throw new Error('migration failed');
    },
    async activate(component, artifact) {
      events.push(`${component}:${artifact === previous[component] ? 'previous' : 'candidate'}`);
      if (arbitration.recoveryError && component === 'worker' && artifact === previous.worker)
        throw new Error('recovery failed');
      live[component] = artifact;
    },
    async smoke(target) {
      events.push(`smoke:${target.sha === previous.sha ? 'previous' : 'candidate'}`);
      for (const component of ['api', 'worker', 'web'] as const)
        assert.equal(live[component], target[component]);
      if (arbitration.unhealthy && target.sha === candidate.sha)
        throw new Error('candidate failed smoke');
    },
  };
  return { driver, previous, candidate, live, events };
}

test('predeploy failure makes no traffic switch and leaves the previous release intact', async () => {
  const { driver, previous, candidate, live, events } = controlledDriver({ migrationError: true });
  await assert.rejects(rollOutRelease(candidate, repository, driver), /migration failed/);
  assert.deepEqual(live, previous);
  assert.deepEqual(events, ['smoke:previous', 'predeploy']);
});

test('activates backend first, then restores immutable artifacts in reverse when smoke fails', async () => {
  const { driver, previous, candidate, live, events } = controlledDriver({ unhealthy: true });
  await assert.rejects(rollOutRelease(candidate, repository, driver), /previous release passed/);
  assert.deepEqual(live, previous);
  assert.deepEqual(events, [
    'smoke:previous',
    'predeploy',
    'api:candidate',
    'worker:candidate',
    'web:candidate',
    'smoke:candidate',
    'web:previous',
    'worker:previous',
    'api:previous',
    'smoke:previous',
  ]);
});

test('rejects mutable and foreign artifacts before calling providers', async () => {
  const { driver, candidate, events } = controlledDriver();
  await assert.rejects(
    rollOutRelease({ ...candidate, api: `ghcr.io/${repository}/api:latest` }, repository, driver),
    /digest/,
  );
  await assert.rejects(
    rollOutRelease(
      { ...candidate, worker: candidate.worker.replace(repository, 'foreign/repo') },
      repository,
      driver,
    ),
    /digest/,
  );
  await assert.rejects(
    rollOutRelease({ ...candidate, web: 'https://app.example.net' }, repository, driver),
    /deployment ID/,
  );
  assert.deepEqual(events, []);
});

test('reports unverified recovery and still attempts to restore the rest of the release', async () => {
  const { driver, candidate, events } = controlledDriver({ unhealthy: true, recoveryError: true });
  await assert.rejects(rollOutRelease(candidate, repository, driver), AggregateError);
  assert.ok(events.includes('api:previous'));
  assert.equal(events.at(-1), 'smoke:previous');
});
