import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  main,
  validateStagingTarget,
  validateStagingTargets,
} from './validate-staging-targets.mjs';

test('accepts HTTPS URLs for non-production staging hosts', () => {
  const targets = validateStagingTargets({
    STAGING_BASE_URL: 'https://cafeteria-preview.example.net',
    STAGING_API_URL: 'https://cafeteria-api-staging.example.net',
  });
  assert.equal(targets.web.hostname, 'cafeteria-preview.example.net');
  assert.equal(targets.api.hostname, 'cafeteria-api-staging.example.net');
});

test('requires both explicit staging URLs', () => {
  assert.throws(() => validateStagingTargets({}), /Set STAGING_BASE_URL and STAGING_API_URL/);
});

test('rejects malformed and non-HTTPS staging URLs', () => {
  assert.throws(() => validateStagingTarget('not a URL', 'STAGING_BASE_URL'), /valid absolute URL/);
  assert.throws(
    () => validateStagingTarget('http://cafeteria-staging.example.net', 'STAGING_BASE_URL'),
    /must use HTTPS/,
  );
});

test('rejects production-like host labels', () => {
  for (const hostname of [
    'production.example.net',
    'api-prod.example.net',
    'shop.production.example.com',
  ]) {
    assert.throws(
      () => validateStagingTarget(`https://${hostname}`, 'STAGING_API_URL'),
      /production-like hostname/,
    );
  }
});

test('rejects HTTPS hosts that are not explicitly identified as staging or preview', () => {
  assert.throws(
    () => validateStagingTarget('https://api.example.net', 'STAGING_API_URL'),
    /must include a staging or preview hostname label/,
  );
});

test('command entry point fails closed when staging URLs are not configured', () => {
  const previousWeb = process.env.STAGING_BASE_URL;
  const previousApi = process.env.STAGING_API_URL;
  const previousExitCode = process.exitCode;
  delete process.env.STAGING_BASE_URL;
  delete process.env.STAGING_API_URL;
  process.exitCode = 0;
  try {
    main();
    assert.equal(process.exitCode, 1);
  } finally {
    if (previousWeb === undefined) delete process.env.STAGING_BASE_URL;
    else process.env.STAGING_BASE_URL = previousWeb;
    if (previousApi === undefined) delete process.env.STAGING_API_URL;
    else process.env.STAGING_API_URL = previousApi;
    process.exitCode = previousExitCode;
  }
});
