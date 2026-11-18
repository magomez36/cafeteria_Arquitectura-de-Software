import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';
import { materializeBlueprint } from './render-blueprint.mjs';

const template = await readFile(new URL('../../render.yaml', import.meta.url), 'utf8');
const repository = 'test/cafeteria';
const values = {
  RENDER_REGION: 'test-region',
  RENDER_API_PLAN: 'approved-plan',
  RENDER_WORKER_PLAN: 'approved-plan',
  RENDER_CACHE_PLAN: 'approved-plan',
  RENDER_POSTGRES_PLAN: 'approved-plan',
  RENDER_GHCR_CREDENTIAL: 'Test read-only registry credential',
  API_IMAGE_DIGEST: `ghcr.io/${repository}/api@sha256:${'a'.repeat(64)}`,
  WORKER_IMAGE_DIGEST: `ghcr.io/${repository}/worker@sha256:${'b'.repeat(64)}`,
};

test('materializes image-backed staging services and private data stores with one region', () => {
  const blueprint = parse(materializeBlueprint(template, repository, values));
  const [api, worker, cache] = blueprint.services;
  for (const resource of [...blueprint.services, ...blueprint.databases])
    assert.equal(resource.region, values.RENDER_REGION);
  assert.equal(api.image.url, values.API_IMAGE_DIGEST);
  assert.equal(worker.image.url, values.WORKER_IMAGE_DIGEST);
  assert.equal(api.autoDeployTrigger, 'off');
  assert.equal(worker.autoDeployTrigger, 'off');
  assert.equal(api.preDeployCommand, 'node apps/api/dist/database/migrate.js');
  assert.equal(api.healthCheckPath, '/health');
  assert.equal(worker.type, 'worker');
  assert.deepEqual(cache.ipAllowList, []);
  assert.deepEqual(blueprint.databases[0].ipAllowList, []);
  assert.deepEqual(worker.envVars, [{ key: 'RABBITMQ_URL', sync: false }]);
});

test('rejects missing configuration, unsupported predeploy plan and foreign or mutable artifacts', () => {
  assert.throws(() => materializeBlueprint(template, repository, {}), /RENDER_REGION/);
  assert.throws(
    () => materializeBlueprint(template, repository, { ...values, RENDER_API_PLAN: 'free' }),
    /RENDER_API_PLAN/,
  );
  assert.throws(
    () =>
      materializeBlueprint(template, repository, {
        ...values,
        API_IMAGE_DIGEST: `ghcr.io/${repository}/api:latest`,
      }),
    /API_IMAGE_DIGEST/,
  );
  assert.throws(
    () =>
      materializeBlueprint(template, repository, {
        ...values,
        WORKER_IMAGE_DIGEST: values.API_IMAGE_DIGEST,
      }),
    /WORKER_IMAGE_DIGEST/,
  );
});
