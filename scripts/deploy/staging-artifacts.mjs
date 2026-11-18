import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitExecutable } from '../ci/git-executable.mjs';
import { validateImageManifest } from './verify-image-archive.mjs';

export function stagingArtifacts(manifest, publication, mergedTree) {
  if (
    manifest?.publication?.runId !== publication.runId ||
    manifest?.publication?.runAttempt !== publication.runAttempt ||
    manifest?.publication?.mergedSha !== publication.mergedSha
  ) {
    throw new Error('The manifest is not from this publication run and merge.');
  }
  validateImageManifest(manifest, {
    ...manifest,
    repository: publication.repository,
    tree: mergedTree,
  });
  if (!Array.isArray(manifest.digests) || manifest.digests.length !== manifest.images.length) {
    throw new Error('Registry digests do not cover all promoted images.');
  }
  const images = {};
  for (const { component } of manifest.images) {
    const entries = manifest.digests.filter((entry) => entry?.component === component);
    const ref = entries[0]?.ref;
    const prefix = `ghcr.io/${publication.repository.toLowerCase()}/${component}@sha256:`;
    if (
      entries.length !== 1 ||
      typeof ref !== 'string' ||
      !ref.startsWith(prefix) ||
      ref.length !== prefix.length + 64 ||
      !/^[a-f0-9]{64}$/.test(ref.slice(prefix.length))
    ) {
      throw new Error(`The published ${component} image must be an immutable registry digest.`);
    }
    images[component] = ref;
  }
  return { sourceSha: manifest.sourceSha, mergedSha: publication.mergedSha, images };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(await readFile('published-staging-input/image-digests.json', 'utf8'));
  const { GITHUB_REPOSITORY, PUBLISH_RUN_ID, PUBLISH_RUN_ATTEMPT } = process.env;
  const mergedSha = manifest?.publication?.mergedSha;
  if (
    typeof mergedSha !== 'string' ||
    mergedSha.length !== 40 ||
    !/^[a-f0-9]{40}$/.test(mergedSha)
  ) {
    throw new Error('The publication has no valid merged commit SHA.');
  }
  const git = gitExecutable();
  execFileSync(git, ['merge-base', '--is-ancestor', mergedSha, 'HEAD']);
  const tree = execFileSync(git, ['rev-parse', `${mergedSha}^{tree}`], {
    encoding: 'utf8',
  }).trim();
  const plan = stagingArtifacts(
    manifest,
    {
      repository: GITHUB_REPOSITORY,
      runId: PUBLISH_RUN_ID,
      runAttempt: PUBLISH_RUN_ATTEMPT,
      mergedSha,
    },
    tree,
  );
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}
