import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('release-please only runs on main and opens a reviewable release PR', async () => {
  const workflow = parse(
    await readFile(path.join(root, '.github/workflows/release-please.yml'), 'utf8'),
  );
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.jobs['release-please'].permissions.contents, 'write');
  assert.equal(workflow.jobs['release-please'].permissions['pull-requests'], 'write');
  assert.match(
    workflow.jobs['release-please'].steps[0].uses,
    /@45996ed1f6d02564a971a2fa1b5860e934307cf7$/,
  );
  assert.equal(
    workflow.jobs['release-please'].steps[0].with['config-file'],
    'release-please-config.json',
  );
  assert.equal(
    workflow.jobs['release-please'].steps[0].with['manifest-file'],
    '.release-please-manifest.json',
  );
});

test('release-please uses the existing root semver baseline and does not trigger production deployment', async () => {
  const config = JSON.parse(
    await readFile(path.join(root, 'release-please-config.json'), 'utf8'),
  ) as {
    packages: Record<string, { 'release-type': string; 'package-name': string }>;
  };
  const manifest = JSON.parse(
    await readFile(path.join(root, '.release-please-manifest.json'), 'utf8'),
  ) as Record<string, string>;
  const workflow = await readFile(path.join(root, '.github/workflows/release-please.yml'), 'utf8');

  assert.equal(config.packages['.']?.['release-type'], 'node');
  assert.equal(config.packages['.']?.['package-name'], 'cafeteria');
  assert.equal(manifest['.'], '0.0.0');
  assert.doesNotMatch(workflow, /VERCEL|RENDER|PRODUCTION|deploy-production/i);
});
