import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateImageManifest, verifyImageArchive } from './verify-image-archive.mjs';
import { stagingArtifacts } from './staging-artifacts.mjs';

const expected = {
  repository: 'test/repository',
  prNumber: '1',
  runId: '15',
  runAttempt: '2',
  sourceSha: 'a'.repeat(40),
  tree: 'b'.repeat(40),
};
const archive = 'archive bytes from CI';
const manifest = {
  ...expected,
  version: 1,
  archiveSha256: createHash('sha256').update(archive).digest('hex'),
  images: [{ component: 'api', id: `sha256:${'c'.repeat(64)}` }],
};

test('staging accepts only exact published run and immutable artifacts for the merged tree', () => {
  const publication = {
    repository: expected.repository,
    runId: '57',
    runAttempt: '1',
    mergedSha: 'b'.repeat(40),
  };
  const ref = `ghcr.io/${expected.repository}/api@sha256:${'d'.repeat(64)}`;
  const published = { ...manifest, publication, digests: [{ component: 'api', ref }] };
  assert.deepEqual(stagingArtifacts(published, publication, expected.tree), {
    sourceSha: expected.sourceSha,
    mergedSha: publication.mergedSha,
    images: { api: ref },
  });
  assert.throws(
    () => stagingArtifacts(published, { ...publication, runAttempt: '2' }, expected.tree),
    /publication run/,
  );
  assert.throws(() => stagingArtifacts(published, publication, 'a'.repeat(40)), /verified tree/);
  for (const digests of [
    [],
    [published.digests[0], published.digests[0]],
    [{ component: 'api', ref: ref.replace('@sha256:', ':') }],
  ]) {
    assert.throws(
      () => stagingArtifacts({ ...published, digests }, publication, expected.tree),
      /digests|immutable/,
    );
  }
});

test('binds promotion to the repository, PR, CI attempt, source SHA and merged tree', () => {
  assert.doesNotThrow(() => validateImageManifest(manifest, expected));
  for (const key of Object.keys(expected)) {
    assert.throws(
      () => validateImageManifest(manifest, { ...expected, [key]: 'wrong' }),
      new RegExp(key),
    );
  }
});

test('rejects missing, missing-ID, unknown and duplicate components in the manifest', () => {
  for (const images of [
    [],
    [{ component: 'api' }],
    [{ ...manifest.images[0], component: 'web' }],
    [...manifest.images, ...manifest.images],
  ]) {
    assert.throws(
      () => validateImageManifest({ ...manifest, images }, expected),
      /images|identities/,
    );
  }
});

test('streams the exact archived bytes and rejects an altered archive', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'cafeteria-image-archive-'));
  const directory = path.join(workspace, 'verified-images');
  try {
    await mkdir(directory);
    await writeFile(path.join(directory, 'image-manifest.json'), JSON.stringify(manifest));
    const archivePath = path.join(directory, 'verified-images.tar');
    await writeFile(archivePath, archive);
    assert.deepEqual(await verifyImageArchive(directory, expected), manifest);
    const command = fileURLToPath(new URL('./verify-image-archive.mjs', import.meta.url));
    execFileSync(process.execPath, [command], {
      cwd: workspace,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: expected.repository,
        PR_NUMBER: expected.prNumber,
        VERIFIED_RUN_ID: expected.runId,
        VERIFIED_RUN_ATTEMPT: expected.runAttempt,
        SOURCE_SHA: expected.sourceSha,
        MERGED_TREE: expected.tree,
      },
    });
    await writeFile(archivePath, `${archive}!`);
    await assert.rejects(verifyImageArchive(directory, expected), /differs from CI/);
  } finally {
    await rm(workspace, { recursive: true });
  }
});
