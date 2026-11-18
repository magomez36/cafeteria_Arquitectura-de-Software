import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('telemetry workflow reads trusted default-branch runs with read-only permissions and retains records', async () => {
  const workflow = parse(
    await readFile(path.join(root, '.github/workflows/telemetry.yml'), 'utf8'),
  );
  assert.deepEqual(workflow.on.workflow_run.workflows, [
    'Pull request CI',
    'Staging deployment',
    'Production release',
  ]);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions.actions, 'read');
  assert.match(
    workflow.jobs.collect.if,
    /workflow_run\.head_repository\.full_name == github\.repository/,
    'workflow_run events from forks must not enter the telemetry job',
  );
  assert.equal(workflow.jobs.collect.steps.at(-1).with['retention-days'], 30);
  assert.match(
    workflow.jobs.collect.steps.at(-1).if,
    /always\(\).*hashFiles\('telemetry\.jsonl'\)/,
  );
  assert.match(
    workflow.jobs.collect.steps.at(-1).with.name,
    /github\.event\.workflow_run\.run_attempt/,
  );
  const publishStep = workflow.jobs.collect.steps.find(
    (step: { name?: string }) =>
      step.name === 'Record workflow outcome, immutable SHA and duration',
  );
  assert.equal(
    publishStep?.env?.GRAFANA_OTLP_METRICS_ENDPOINT,
    '${{ vars.GRAFANA_OTLP_METRICS_ENDPOINT }}',
  );
  assert.equal(
    publishStep?.env?.GRAFANA_OTLP_AUTHORIZATION,
    '${{ secrets.GRAFANA_OTLP_AUTHORIZATION }}',
  );
  for (const step of workflow.jobs.collect.steps.filter((entry: { uses?: string }) => entry.uses)) {
    assert.match(step.uses, /@[0-9a-f]{40}(?:\s|$)/);
  }
});

test('Grafana datasource template uses least-privilege secret references without credentials', async () => {
  const sources = parse(
    await readFile(path.join(root, 'infra/grafana/datasources.yaml'), 'utf8'),
  ).datasources;
  assert.equal(sources.length, 2);
  const github = sources.find((source: { uid?: string }) => source.uid === 'cafeteria-github');
  assert.equal(github?.type, 'grafana-github-datasource');
  assert.equal(github?.jsonData.selectedAuthType, 'github-app');
  assert.equal(github?.jsonData.appId, '$GRAFANA_GITHUB_APP_ID');
  assert.equal(github?.jsonData.installationId, '$GRAFANA_GITHUB_INSTALLATION_ID');
  assert.equal(github?.secureJsonData.privateKey, '$GRAFANA_GITHUB_APP_PRIVATE_KEY');

  const metrics = sources.find((source: { uid?: string }) => source.uid === 'DS_PROMETHEUS');
  assert.equal(metrics?.url, '$GRAFANA_CLOUD_PROMETHEUS_URL');
  assert.equal(metrics?.basicAuthUser, '$GRAFANA_CLOUD_METRICS_USER');
  assert.equal(metrics?.secureJsonData.basicAuthPassword, '$GRAFANA_CLOUD_METRICS_READ_TOKEN');
  assert.equal(metrics?.isDefault, true);
});

test('nightly load execution can target only configured staging URLs and never gets deploy credentials', async () => {
  const workflow = parse(
    await readFile(path.join(root, '.github/workflows/load-staging.yml'), 'utf8'),
  );
  assert.ok(workflow.on.schedule.length > 0);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  assert.equal(workflow.jobs.k6.environment, 'staging');
  assert.equal(workflow.permissions.contents, 'read');
  assert.match(
    await readFile(path.join(root, '.github/workflows/load-staging.yml'), 'utf8'),
    /node scripts\/load\/validate-staging-targets\.mjs/,
  );
  assert.doesNotMatch(
    await readFile(path.join(root, '.github/workflows/load-staging.yml'), 'utf8'),
    /python\s+-c/,
  );
  assert.doesNotMatch(
    await readFile(path.join(root, '.github/workflows/load-staging.yml'), 'utf8'),
    /secrets\.|VERCEL|RENDER_API_TOKEN|environment:\s*production/i,
  );
  assert.match(await readFile(path.join(root, 'tests/load/staging.js'), 'utf8'), /p\(95\)<300/);
  const scenario = await readFile(path.join(root, 'tests/load/staging.js'), 'utf8');
  assert.match(scenario, /stagingOrigin\(__ENV\.STAGING_BASE_URL/);
  assert.match(scenario, /maxRedirects: 0/);
  assert.match(scenario, /vus: 5, duration: '2m'/);
  assert.match(scenario, /checks: \['rate==1'\]/);
  const source = await readFile(path.join(root, '.github/workflows/load-staging.yml'), 'utf8');
  assert.match(source, /github\.ref_name == github\.event\.repository\.default_branch/);
  assert.match(source, /steps\.preflight\.outputs\.configured == 'true'/);
});

test('Grafana dashboards and privacy desired state are parseable and individual metrics remain disabled', async () => {
  const dashboardDir = path.join(root, 'infra/grafana/dashboards');
  const dashboards = (await readdir(dashboardDir)).filter((name) => name.endsWith('.json'));
  assert.deepEqual(dashboards.sort(), [
    'delivery.json',
    'pipeline-health.json',
    'quality.json',
    'team-contribution.json',
    'workflow.json',
  ]);
  for (const name of dashboards) {
    const dashboard = JSON.parse(await readFile(path.join(dashboardDir, name), 'utf8')) as {
      panels?: unknown[];
    };
    assert.ok(Array.isArray(dashboard.panels) && dashboard.panels.length > 0, `${name} has panels`);
  }
  const access = parse(await readFile(path.join(root, 'infra/grafana/access.yaml'), 'utf8'));
  assert.equal(access.defaults.individual_dashboard, 'disabled');
  const alerts = parse(
    await readFile(path.join(root, 'infra/grafana/alerts/delivery.yaml'), 'utf8'),
  );
  assert.equal(alerts.groups[0].rules.length, 3);
});
