import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagingOrigin } from '../../tests/load/staging-origin.mjs';

export function validateStagingTarget(value, name) {
  return new URL(stagingOrigin(value, name));
}

export function validateStagingTargets(environment = process.env) {
  const web = environment.STAGING_BASE_URL;
  const api = environment.STAGING_API_URL;
  if (!web || !api) {
    throw new Error('Set STAGING_BASE_URL and STAGING_API_URL to approved staging URLs.');
  }

  return {
    web: validateStagingTarget(web, 'STAGING_BASE_URL'),
    api: validateStagingTarget(api, 'STAGING_API_URL'),
  };
}

export function main() {
  try {
    validateStagingTargets();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid staging target.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
