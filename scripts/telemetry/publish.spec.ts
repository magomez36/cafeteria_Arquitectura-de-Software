import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ExportResultCode } from '@opentelemetry/core';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  type PushMetricExporter,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import {
  exportWorkflowMetrics,
  persistWorkflowRunRecord,
  RetryingMetricExporter,
  workflowRunMetric,
  workflowRunRecord,
  main,
} from './publish.js';

test('emits sourced, team-level duration telemetry for an immutable workflow run', () => {
  const metric = workflowRunMetric({
    id: 42,
    name: 'Pull request CI',
    head_sha: 'a'.repeat(40),
    head_branch: 'feature/spec-1',
    conclusion: 'success',
    run_started_at: '2026-11-15T10:00:00.000Z',
    updated_at: '2026-11-15T10:02:30.000Z',
  });
  assert.equal(metric.value, 150);
  assert.equal(metric.unit, 'seconds');
  assert.deepEqual(metric.subject, { type: 'team' });
});

test('retains outcome and SHA, and classifies staging deployment telemetry', () => {
  const run = {
    id: 43,
    name: 'Staging deployment',
    head_sha: 'b'.repeat(40),
    head_branch: 'main',
    conclusion: 'success',
    run_started_at: '2026-11-15T10:00:00.000Z',
    updated_at: '2026-11-15T10:01:00.000Z',
  };
  const record = workflowRunRecord(run);
  assert.equal(record.result, 'success');
  assert.equal(record.sha, run.head_sha);
  assert.equal(record.branch, 'main');
  assert.deepEqual(record.deployment, { environment: 'staging', sha: run.head_sha });
  assert.equal(record.metric.source, 'deployment');
});

test('rejects missing or reversed workflow timestamps', () => {
  assert.throws(
    () =>
      workflowRunMetric({
        id: 42,
        name: 'Pull request CI',
        head_sha: 'a'.repeat(40),
        head_branch: 'main',
        conclusion: 'success',
        run_started_at: 'bad',
        updated_at: '2026-11-15T10:00:00.000Z',
      }),
    /valid, ordered timestamps/,
  );
});

test('exports workflow duration and run provenance as OpenTelemetry metrics', async () => {
  const record = workflowRunRecord({
    id: 44,
    name: 'Pull request CI',
    head_sha: 'c'.repeat(40),
    head_branch: 'feature/spec-1',
    conclusion: 'success',
    run_started_at: '2026-11-15T10:00:00.000Z',
    updated_at: '2026-11-15T10:02:30.000Z',
  });
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  await exportWorkflowMetrics(record, { exporter, retry: { maxAttempts: 1, delayMs: 0 } });

  const metrics = exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics));
  const duration = metrics.find(
    (metric) => metric.descriptor.name === 'github_workflow_duration_seconds',
  );
  const runInfo = metrics.find((metric) => metric.descriptor.name === 'github_workflow_run_info');
  const runCount = metrics.find((metric) => metric.descriptor.name === 'github_workflow_runs');

  assert.ok(duration);
  assert.equal(duration.dataPoints[0]?.value, 150);
  assert.equal(duration.dataPoints[0]?.attributes.conclusion, 'success');
  assert.ok(runInfo);
  assert.equal(runInfo.dataPoints[0]?.attributes.sha, record.sha);
  assert.equal(runInfo.dataPoints[0]?.attributes.branch, 'non-main');
  assert.equal(record.branch, 'non-main');
  assert.ok(runCount);
  assert.equal(runCount.dataPoints[0]?.value, 1);
  assert.equal(runCount.dataPoints[0]?.attributes.conclusion, 'success');
  await exporter.shutdown();
});

test('requires the secure Grafana OTLP metrics endpoint path', async () => {
  const record = workflowRunRecord({
    id: 48,
    name: 'Pull request CI',
    head_sha: 'a'.repeat(40),
    head_branch: 'main',
    conclusion: 'success',
    run_started_at: '2026-11-15T10:00:00.000Z',
    updated_at: '2026-11-15T10:01:00.000Z',
  });

  await assert.rejects(
    exportWorkflowMetrics(record, {
      endpoint: 'https://otlp.example.test/otlp',
      authorization: 'test-only',
    }),
    /path must end with \/v1\/metrics/,
  );
  await assert.rejects(
    exportWorkflowMetrics(record, {
      endpoint: 'http://otlp.example.test/otlp/v1/metrics',
      authorization: 'test-only',
    }),
    /must use HTTPS/,
  );
});

test('retries a transient Grafana export failure and then succeeds', async () => {
  let attempts = 0;
  const delegate: PushMetricExporter = {
    export(_metrics: ResourceMetrics, callback) {
      attempts += 1;
      callback(
        attempts === 1
          ? { code: ExportResultCode.FAILED, error: new Error('temporary outage') }
          : { code: ExportResultCode.SUCCESS },
      );
    },
    forceFlush: async () => undefined,
    shutdown: async () => undefined,
  };
  const exporter = new RetryingMetricExporter(delegate, { maxAttempts: 3, delayMs: 0 });
  const record = workflowRunRecord({
    id: 45,
    name: 'Pull request CI',
    head_sha: 'd'.repeat(40),
    head_branch: 'main',
    conclusion: 'success',
    run_started_at: '2026-11-15T10:00:00.000Z',
    updated_at: '2026-11-15T10:01:00.000Z',
  });

  await exportWorkflowMetrics(record, { exporter, retry: { maxAttempts: 3, delayMs: 0 } });
  assert.equal(attempts, 2);
  assert.equal(exporter.lastFailure, null);
});

test('preserves the local spool result when Grafana remains unavailable after retries', async () => {
  let attempts = 0;
  const delegate: PushMetricExporter = {
    export(_metrics: ResourceMetrics, callback) {
      attempts += 1;
      callback({ code: ExportResultCode.FAILED, error: new Error('Grafana unavailable') });
    },
    forceFlush: async () => undefined,
    shutdown: async () => undefined,
  };
  const exporter = new RetryingMetricExporter(delegate, { maxAttempts: 3, delayMs: 0 });
  const record = workflowRunRecord({
    id: 46,
    name: 'Production release',
    head_sha: 'e'.repeat(40),
    head_branch: 'main',
    conclusion: 'success',
    run_started_at: '2026-11-15T10:00:00.000Z',
    updated_at: '2026-11-15T10:01:00.000Z',
  });

  await assert.rejects(
    exportWorkflowMetrics(record, { exporter, retry: { maxAttempts: 3, delayMs: 0 } }),
    /Grafana export failed after 3 attempts/,
  );
  assert.equal(attempts, 9, 'three metric instruments each receive the configured three attempts');
  assert.match(exporter.lastFailure?.message ?? '', /Grafana unavailable/);
});

test('persists workflow provenance in JSONL before remote export is attempted', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cafeteria-telemetry-'));
  try {
    const record = workflowRunRecord({
      id: 47,
      name: 'Staging deployment',
      head_sha: 'f'.repeat(40),
      head_branch: 'main',
      conclusion: 'success',
      run_started_at: '2026-11-15T10:00:00.000Z',
      updated_at: '2026-11-15T10:01:00.000Z',
    });
    const outputPath = path.join(directory, 'telemetry.jsonl');
    await persistWorkflowRunRecord(outputPath, record);
    assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), record);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('does not hide a failed metric batch when a later batch succeeds', async () => {
  let attempts = 0;
  const delegate: PushMetricExporter = {
    export(_metrics: ResourceMetrics, callback) {
      attempts += 1;
      callback(
        attempts <= 3
          ? { code: ExportResultCode.FAILED, error: new Error('first metric was rejected') }
          : { code: ExportResultCode.SUCCESS },
      );
    },
    forceFlush: async () => undefined,
    shutdown: async () => undefined,
  };
  const exporter = new RetryingMetricExporter(delegate, { maxAttempts: 3, delayMs: 0 });
  const metrics = {} as ResourceMetrics;
  const results: number[] = [];

  await new Promise<void>((resolve) => {
    exporter.export(metrics, (result) => {
      results.push(result.code);
      resolve();
    });
  });
  assert.equal(attempts, 3);
  assert.match(exporter.lastFailure?.message ?? '', /first metric was rejected/);

  await new Promise<void>((resolve) => {
    exporter.export(metrics, (result) => {
      results.push(result.code);
      resolve();
    });
  });
  assert.equal(attempts, 4);
  assert.deepEqual(results, [ExportResultCode.FAILED, ExportResultCode.SUCCESS]);
  assert.match(exporter.lastFailure?.message ?? '', /first metric was rejected/);
});

test('reads a workflow event, persists telemetry, and tolerates an unconfigured exporter', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cafeteria-telemetry-main-'));
  const eventPath = path.join(directory, 'event.json');
  const outputPath = path.join(directory, 'telemetry.jsonl');
  const summaryPath = path.join(directory, 'summary.md');
  const previous = {
    event: process.env.GITHUB_EVENT_PATH,
    output: process.env.GITHUB_OUTPUT_FILE,
    summary: process.env.GITHUB_STEP_SUMMARY,
    endpoint: process.env.GRAFANA_OTLP_METRICS_ENDPOINT,
    authorization: process.env.GRAFANA_OTLP_AUTHORIZATION,
  };
  await writeFile(
    eventPath,
    JSON.stringify({
      workflow_run: {
        id: 48,
        name: 'Pull request CI',
        head_sha: '1'.repeat(40),
        head_branch: 'feature/spec-1',
        conclusion: 'success',
        run_started_at: '2026-11-15T10:00:00.000Z',
        updated_at: '2026-11-15T10:00:30.000Z',
      },
    }),
    'utf8',
  );
  process.env.GITHUB_EVENT_PATH = eventPath;
  process.env.GITHUB_OUTPUT_FILE = outputPath;
  process.env.GITHUB_STEP_SUMMARY = summaryPath;
  delete process.env.GRAFANA_OTLP_METRICS_ENDPOINT;
  delete process.env.GRAFANA_OTLP_AUTHORIZATION;
  try {
    await main();
    const record = JSON.parse(await readFile(outputPath, 'utf8')) as {
      workflowRunId: number;
      sha: string;
      result: string;
    };
    assert.equal(record.workflowRunId, 48);
    assert.equal(record.sha, '1'.repeat(40));
    assert.equal(record.result, 'success');
    assert.match(await readFile(summaryPath, 'utf8'), /reported success in 30 seconds/);
  } finally {
    await rm(directory, { recursive: true, force: true });
    if (previous.event === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = previous.event;
    if (previous.output === undefined) delete process.env.GITHUB_OUTPUT_FILE;
    else process.env.GITHUB_OUTPUT_FILE = previous.output;
    if (previous.summary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous.summary;
    if (previous.endpoint === undefined) delete process.env.GRAFANA_OTLP_METRICS_ENDPOINT;
    else process.env.GRAFANA_OTLP_METRICS_ENDPOINT = previous.endpoint;
    if (previous.authorization === undefined) delete process.env.GRAFANA_OTLP_AUTHORIZATION;
    else process.env.GRAFANA_OTLP_AUTHORIZATION = previous.authorization;
  }
});

test('rejects a missing workflow event and invalid run identity', async () => {
  const previous = process.env.GITHUB_EVENT_PATH;
  try {
    delete process.env.GITHUB_EVENT_PATH;
    await assert.rejects(main(), /GITHUB_EVENT_PATH is required/);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cafeteria-telemetry-invalid-'));
    const eventPath = path.join(directory, 'event.json');
    try {
      await writeFile(eventPath, JSON.stringify({ workflow_run: { id: 0, head_sha: 'latest' } }));
      process.env.GITHUB_EVENT_PATH = eventPath;
      await assert.rejects(main(), /workflow run id and immutable commit SHA/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  } finally {
    if (previous === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = previous;
  }
});
