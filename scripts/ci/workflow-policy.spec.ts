import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ciPath = path.join(root, '.github/workflows/ci.yml');
const securityPath = path.join(root, '.github/workflows/security.yml');
const previewPath = path.join(root, '.github/workflows/deploy-preview.yml');
const publishPath = path.join(root, '.github/workflows/publish-images.yml');
const releasePleasePath = path.join(root, '.github/workflows/release-please.yml');
const telemetryPath = path.join(root, '.github/workflows/telemetry.yml');
const loadStagingPath = path.join(root, '.github/workflows/load-staging.yml');
const commitRangePath = path.join(root, 'scripts/ci/validate-commit-range.ts');

interface WorkflowStep {
  readonly name?: string;
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
}

interface WorkflowJob {
  readonly environment?: string;
  readonly if?: string;
  readonly needs?: string[];
  readonly permissions?: Record<string, string>;
  readonly steps: WorkflowStep[];
}

interface Workflow {
  readonly on: {
    readonly push?: { readonly branches?: string[] };
    readonly pull_request?: { readonly branches?: string[]; readonly types?: string[] };
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
  assert.match(ci.jobs.images.if ?? '', /always\(\).*needs\.security\.result == 'success'/);
  assert.match(ci.jobs.images.if ?? '', /needs\.quality\.outputs\.api_changed != ''/);
  assert.equal(ci.jobs.security.permissions?.['security-events'], 'write');
  assert.ok(ci.jobs.report);
  assert.deepEqual(ci.jobs.report.needs, ['quality', 'security', 'images']);
  assert.equal(ci.jobs.report.permissions?.actions, 'read');
});

test('pnpm is installed before setup-node configures the pnpm cache', async () => {
  const ci = await workflow(ciPath);
  const qualitySteps = ci.jobs.quality.steps;
  const pnpmSetupIndex = qualitySteps.findIndex((step) => step.name === 'Set up pnpm');
  const nodeSetupIndex = qualitySteps.findIndex((step) => step.name === 'Set up Node.js');

  assert.ok(pnpmSetupIndex >= 0, 'the quality job must install pnpm');
  assert.ok(nodeSetupIndex > pnpmSetupIndex, 'pnpm setup must precede setup-node');
  assert.equal(qualitySteps[nodeSetupIndex]?.with?.cache, 'pnpm');
});

test('commit-range policy tests do not inherit GitHub runtime event payloads', async () => {
  const commitRange = await readFile(commitRangePath, 'utf8');
  assert.match(commitRange, /delete testEnvironment\.GITHUB_EVENT_PATH/);
  assert.ok(commitRange.includes('scripts\\/(ci|deploy|telemetry)\\/'));
  assert.doesNotMatch(commitRange, /commits\.length > 10/);
  assert.match(commitRange, /durationMs >= 15 \* 60 \* 1000/);
});

test('code changes generate workspace LCOV and require a blocking SonarQube gate', async () => {
  const ci = await workflow(ciPath);
  const qualitySteps = ci.jobs.quality.steps;
  const coverageIndex = qualitySteps.findIndex(
    (step) => step.name === 'Generate LCOV reports for all workspaces',
  );
  const credentialsIndex = qualitySteps.findIndex(
    (step) => step.name === 'Require SonarQube project and credentials',
  );
  const analysisIndex = qualitySteps.findIndex(
    (step) => step.name === 'SonarQube analysis and blocking Quality Gate',
  );
  const sonarProperties = await readFile(path.join(root, 'sonar-project.properties'), 'utf8');
  const workflowSource = await readFile(ciPath, 'utf8');

  assert.ok(coverageIndex >= 0, 'the quality job must generate coverage');
  assert.ok(
    credentialsIndex > coverageIndex,
    'credentials must be validated after LCOV generation',
  );
  assert.ok(analysisIndex > credentialsIndex, 'analysis must follow credential validation');
  assert.match(workflowSource, /SONAR_TOKEN:\s*\$\{\{ secrets\.SONAR_TOKEN \}\}/);
  assert.match(workflowSource, /SONAR_PROJECT_KEY:\s*\$\{\{ vars\.SONAR_PROJECT_KEY \}\}/);
  assert.match(workflowSource, /SONAR_ORGANIZATION:\s*\$\{\{ vars\.SONAR_ORGANIZATION \}\}/);
  assert.match(workflowSource, /test -n "\$SONAR_TOKEN".*exit 1/s);
  assert.match(sonarProperties, /sonar\.qualitygate\.wait=true/);
  assert.equal((sonarProperties.match(/coverage\/lcov\.info/g) ?? []).length, 6);
});

test('CI actions are pinned, base PR CI has no deployment secrets, and preview is gated', async () => {
  for (const file of [
    ciPath,
    securityPath,
    previewPath,
    publishPath,
    releasePleasePath,
    telemetryPath,
    loadStagingPath,
  ]) {
    const source = await readFile(file, 'utf8');
    const actionReferences = [...source.matchAll(/^[ \t]*(?:-[ \t]*)?uses:[ \t]*([^ \t\r\n#]+)/gm)];
    if (file !== publishPath)
      assert.ok(actionReferences.length > 0, `${file} must contain pinned actions`);
    for (const match of actionReferences) {
      const reference = match[1];
      if (reference.startsWith('./')) continue;
      assert.match(reference, /@[0-9a-f]{40}$/, `${reference} must use an immutable SHA`);
    }
    if (file !== previewPath)
      assert.doesNotMatch(source, /secrets\.(VERCEL|RENDER|GHCR|PRODUCTION)/i);
  }
  const preview = await workflow(previewPath);
  assert.deepEqual(preview.jobs['deploy-preview']?.needs, ['require-ci']);
  const previewSource = await readFile(previewPath, 'utf8');
  assert.match(previewSource, /head\.repo\.full_name == github\.repository/);
  assert.match(previewSource, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(previewSource, /prebuilt artifact without deploy credentials/);
  assert.equal(preview.jobs['deploy-preview']?.environment, 'preview');
  const previewSteps = preview.jobs['deploy-preview']?.steps.map((step) => step.name ?? '') ?? [];
  assert.ok(
    previewSteps.indexOf('Deploy the prebuilt preview') <
      previewSteps.indexOf('Install Chromium for preview smoke and accessibility tests'),
  );
  assert.ok(
    previewSteps.indexOf('Install Chromium for preview smoke and accessibility tests') <
      previewSteps.indexOf('Verify preview web and shared staging API'),
  );
  assert.match(previewSource, /RENDER_STAGING_API_URL/);
  assert.doesNotMatch(await readFile(ciPath, 'utf8'), /secrets\.(VERCEL|RENDER|GHCR|PRODUCTION)/i);
  assert.doesNotMatch(
    await readFile(securityPath, 'utf8'),
    /secrets\.(VERCEL|RENDER|GHCR|PRODUCTION)/i,
  );
});

test('GHCR publishes only merged PR images previously built and scanned by CI', async () => {
  const publish = await workflow(publishPath);
  assert.deepEqual(publish.on.pull_request?.branches, ['main']);
  assert.deepEqual(publish.on.pull_request?.types, ['closed']);
  assert.match(await readFile(publishPath, 'utf8'), /pull_request\.merged == true/);
  assert.equal(publish.permissions.contents, 'read');
  assert.equal(publish.jobs.publish?.permissions?.actions, 'read');
  assert.equal(publish.jobs.publish?.permissions?.packages, 'write');
  assert.equal(publish.jobs.publish?.permissions?.contents, 'read');
  assert.equal(publish.jobs.publish?.permissions?.['pull-requests'], 'read');

  const steps = publish.jobs.publish.steps.map((step) => step.name ?? '');
  assert.ok(
    steps.indexOf('Locate successful PR CI run for the exact source SHA') <
      steps.indexOf('Download images built and scanned by PR CI'),
  );
  assert.ok(
    steps.indexOf('Download images built and scanned by PR CI') <
      steps.indexOf('Validate source manifest and detect images to promote'),
  );
  assert.ok(
    steps.indexOf('Validate source manifest and detect images to promote') <
      steps.indexOf('Load the scanned image archive'),
  );
  assert.ok(
    steps.indexOf('Load the scanned image archive') <
      steps.indexOf('Authenticate to GHCR with the job-scoped token'),
  );
  assert.ok(
    steps.indexOf('Authenticate to GHCR with the job-scoped token') <
      steps.indexOf('Push verified images and record immutable digests'),
  );
  const publishSource = await readFile(publishPath, 'utf8');
  assert.match(publishSource, /--commit "\$SOURCE_SHA"/);
  assert.match(publishSource, /verified-images-\$SOURCE_SHA/);
  assert.match(publishSource, /\.sourceSha == \$sha/);
  assert.match(publishSource, /image-digests\.txt/);
  assert.doesNotMatch(publishSource, /docker build/);
  assert.match(publishSource, /cancel-in-progress: false/);
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
  assert.ok(
    imageSteps.indexOf('Scan API image for high and critical vulnerabilities') <
      imageSteps.indexOf('Save scanned images for immutable promotion'),
  );
  assert.ok(
    imageSteps.indexOf('Scan worker image for high and critical vulnerabilities') <
      imageSteps.indexOf('Save scanned images for immutable promotion'),
  );
  assert.ok(
    imageSteps.indexOf('Save scanned images for immutable promotion') <
      imageSteps.indexOf('Record verified artifact manifest'),
  );
  assert.ok(
    imageSteps.indexOf('Record verified artifact manifest') <
      imageSteps.indexOf('Retain scanned image archive for post-merge promotion'),
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
