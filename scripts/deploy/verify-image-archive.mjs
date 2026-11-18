import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = /^[0-9a-f]{40}$/;
const checksum = /^[0-9a-f]{64}$/;
const imageId = /^sha256:[0-9a-f]{64}$/;

export function validateImageManifest(manifest, expected) {
  if (manifest?.version !== 1) throw new Error('Unsupported image manifest version.');
  const fields = {
    repository: /^[\w.-]+\/[\w.-]+$/,
    prNumber: /^[1-9]\d*$/,
    runId: /^[1-9]\d*$/,
    runAttempt: /^[1-9]\d*$/,
    sourceSha: sha,
    tree: sha,
  };
  for (const [key, pattern] of Object.entries(fields)) {
    if (
      typeof manifest[key] !== 'string' ||
      !pattern.test(manifest[key]) ||
      manifest[key] !== expected[key]
    ) {
      throw new Error(`Image manifest does not match verified ${key}.`);
    }
  }
  if (typeof manifest.archiveSha256 !== 'string' || !checksum.test(manifest.archiveSha256)) {
    throw new Error('Image archive SHA-256 is invalid.');
  }
  if (
    !Array.isArray(manifest.images) ||
    manifest.images.length === 0 ||
    manifest.images.length > 2
  ) {
    throw new Error('The verified archive must contain one or two images.');
  }
  const components = new Set();
  for (const image of manifest.images) {
    if (
      !['api', 'worker'].includes(image?.component) ||
      typeof image.id !== 'string' ||
      image.id.length !== 71 ||
      !imageId.test(image.id) ||
      components.has(image.component)
    ) {
      throw new Error('Image identities must be unique API or worker IDs.');
    }
    components.add(image.component);
  }
}

export async function verifyImageArchive(directory, expected) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'image-manifest.json'), 'utf8'));
  validateImageManifest(manifest, expected);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(directory, 'verified-images.tar'))) {
    hash.update(chunk);
  }
  if (hash.digest('hex') !== manifest.archiveSha256)
    throw new Error('Image archive SHA-256 differs from CI.');
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {
    GITHUB_REPOSITORY,
    PR_NUMBER,
    VERIFIED_RUN_ID,
    VERIFIED_RUN_ATTEMPT,
    SOURCE_SHA,
    MERGED_TREE,
  } = process.env;
  await verifyImageArchive('verified-images', {
    repository: GITHUB_REPOSITORY,
    prNumber: PR_NUMBER,
    runId: VERIFIED_RUN_ID,
    runAttempt: VERIFIED_RUN_ATTEMPT,
    sourceSha: SOURCE_SHA,
    tree: MERGED_TREE,
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
