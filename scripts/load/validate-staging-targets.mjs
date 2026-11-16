import path from 'node:path';
import { fileURLToPath } from 'node:url';

const productionHostLabel = /(^|[.-])(prod|production)([.-]|$)/i;
const stagingHostLabel = /(^|[.-])(staging|preview)([.-]|$)/i;

export function validateStagingTarget(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS.`);
  }
  if (productionHostLabel.test(url.hostname)) {
    throw new Error(`${name} must not target a production-like hostname.`);
  }
  if (!stagingHostLabel.test(url.hostname)) {
    throw new Error(`${name} must include a staging or preview hostname label.`);
  }
  return url;
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateStagingTargets();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid staging target.');
    process.exitCode = 1;
  }
}
