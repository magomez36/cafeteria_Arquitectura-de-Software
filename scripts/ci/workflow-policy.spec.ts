import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ciPath = path.join(root, '.github/workflows/ci.yml');
const securityPath = path.join(root, '.github/workflows/security.yml');

interface WorkflowStep {
  readonly name?: string;
}

interface WorkflowJob {
  readonly needs?: string[];
  readonly permissions?: Record<string, string>;
  readonly steps: WorkflowStep[];
}

interface Workflow {
  readonly on: {
    readonly pull_request?: { readonly branches?: string[] };
    readonly pull_request_target?: unknown;
    readonly workflow_call?: unknown;
  };
  readonly permissions: Record<string, string>;
  readonly concurrency: {
    readonly group: string;
    readonly 'cancel-in-progress': boolean;
  };
  readonly jobs: Record<string, WorkflowJob>;
}

async function workflow(file: string) {
  return parse(await readFile(file, 'utf8')) as Workflow;
}

test('PR CI targets main, uses a stable concurrency group and read-only default permissions', async () => {
  const ci = await workflow(ciPath);
  assert.deepEqual(ci.on.pull_request?.branches, ['main']);
  assert.equal(ci.on.pull_request_target, undefined);
  assert.equal(ci.permissions.contents, 'read');
  assert.ok(ci.concurrency.group);
  assert.equal(ci.concurrency['cancel-in-progress'], true);
  assert.ok(ci.jobs.quality);
  assert.ok(ci.jobs.security);
  assert.ok(ci.jobs.images);
  assert.deepEqual(ci.jobs.images.needs, ['quality', 'security']);
  assert.equal(ci.jobs.security.permissions?.['security-events'], 'write');
  assert.ok(ci.jobs.report);
  assert.deepEqual(ci.jobs.report.needs, ['quality', 'security', 'images']);
  assert.equal(ci.jobs.report.permissions?.actions, 'read');
});

test('CI actions are pinned to full commit SHAs and PR workflows use no deployment secrets', async () => {
  for (const file of [ciPath, securityPath]) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)\s*$/gm)) {
      const reference = match[1];
      if (reference.startsWith('./')) continue;
      assert.match(reference, /@[0-9a-f]{40}$/, `${reference} must use an immutable SHA`);
    }
    assert.doesNotMatch(source, /secrets\.(VERCEL|RENDER|GHCR|PRODUCTION)/i);
  }
});

test('security scanning is part of the required PR workflow and image scans follow image builds', async () => {
  const ci = await workflow(ciPath);
  const security = await workflow(securityPath);
  assert.ok(ci.jobs.security);
  assert.ok(ci.jobs.images);
  assert.ok(ci.jobs.images.needs?.includes('quality'));
  assert.ok(ci.jobs.images.needs?.includes('security'));
  const imageSteps = ci.jobs.images.steps.map((step: { name?: string }) => step.name ?? '');
  assert.ok(
    imageSteps.indexOf('Build API image') <
      imageSteps.indexOf('Scan API image for high and critical vulnerabilities'),
  );
  assert.ok(
    imageSteps.indexOf('Build worker image') <
      imageSteps.indexOf('Scan worker image for high and critical vulnerabilities'),
  );
  assert.match(await readFile(ciPath, 'utf8'), /severity: HIGH,CRITICAL/);
  assert.match(await readFile(ciPath, 'utf8'), /exit-code: '1'/);
  assert.equal(security.on.workflow_call !== undefined, true);
  assert.match(await readFile(securityPath, 'utf8'), /pnpm audit --audit-level=high/);
  assert.match(await readFile(securityPath, 'utf8'), /gitleaks/i);
  assert.match(
    await readFile(securityPath, 'utf8'),
    /ghcr\.io\/gitleaks\/gitleaks:.*@sha256:[a-f0-9]{64}/,
  );
  assert.match(await readFile(securityPath, 'utf8'), /codeql-action\/init/);
  assert.match(
    await readFile(path.join(root, 'scripts/ci/report-workflow-run.mjs'), 'utf8'),
    /queued|in_progress|success|failure|cancelled/,
  );
  assert.match(
    await readFile(path.join(root, 'scripts/ci/report-workflow-run.mjs'), 'utf8'),
    /durationMs/,
  );
});
