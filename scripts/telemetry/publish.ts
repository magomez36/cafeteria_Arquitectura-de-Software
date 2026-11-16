import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import {
  validateTelemetryMetric,
  type TelemetryMetric,
} from '../../packages/contracts/src/telemetry.schema.js';
import { fileURLToPath } from 'node:url';

interface WorkflowRun {
  readonly id: number;
  readonly name: string;
  readonly head_sha: string;
  readonly head_branch: string;
  readonly conclusion: string | null;
  readonly run_started_at: string;
  readonly updated_at: string;
}

export interface MetricExportRetryOptions {
  readonly maxAttempts?: number;
  readonly delayMs?: number;
  readonly wait?: (milliseconds: number) => Promise<void>;
}

export interface WorkflowMetricExportOptions {
  readonly exporter?: PushMetricExporter;
  readonly endpoint?: string;
  readonly authorization?: string;
  readonly retry?: MetricExportRetryOptions;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class RetryingMetricExporter implements PushMetricExporter {
  lastFailure: Error | null = null;

  readonly maxAttempts: number;
  private readonly delayMs: number;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly delegate: PushMetricExporter,
    options: MetricExportRetryOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.delayMs = options.delayMs ?? 1000;
    this.wait = options.wait ?? wait;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('Metric export maxAttempts must be a positive integer.');
    }
    if (!Number.isFinite(this.delayMs) || this.delayMs < 0) {
      throw new Error('Metric export delayMs must be zero or greater.');
    }
  }

  export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
    let attempt = 0;
    const send = () => {
      attempt += 1;
      const onResult = (result: ExportResult) => {
        if (result.code === ExportResultCode.SUCCESS) {
          resultCallback(result);
          return;
        }
        const error = result.error ?? new Error('OTLP metric export failed.');
        if (attempt >= this.maxAttempts) {
          this.lastFailure = error;
          resultCallback(result);
          return;
        }
        void this.wait(this.delayMs * 2 ** (attempt - 1))
          .then(send)
          .catch((waitError: unknown) => {
            this.lastFailure =
              waitError instanceof Error ? waitError : new Error(String(waitError));
            resultCallback({ code: ExportResultCode.FAILED, error: this.lastFailure });
          });
      };

      try {
        this.delegate.export(metrics, onResult);
      } catch (error) {
        onResult({
          code: ExportResultCode.FAILED,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    };
    send();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}

export function workflowRunMetric(run: WorkflowRun): TelemetryMetric {
  const startedAt = Date.parse(run.run_started_at);
  const finishedAt = Date.parse(run.updated_at);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
    throw new Error('Workflow run must contain valid, ordered timestamps.');
  }
  return {
    name: /staging deployment|production release/i.test(run.name)
      ? 'deployment_duration'
      : 'github_workflow_run_duration',
    value: (finishedAt - startedAt) / 1000,
    unit: 'seconds',
    source: /staging deployment|production release/i.test(run.name) ? 'deployment' : 'github',
    freshnessSeconds: 0,
    periodStart: run.run_started_at,
    periodEnd: run.updated_at,
    collectedAt: new Date().toISOString(),
    subject: { type: 'team' },
  };
}

export function workflowRunRecord(run: WorkflowRun) {
  const metric = workflowRunMetric(run);
  const errors = validateTelemetryMetric(metric);
  if (errors.length) throw new Error(`Invalid telemetry: ${errors.join(', ')}`);
  return {
    schemaVersion: 1,
    workflowRunId: run.id,
    workflow: run.name,
    branch: run.head_branch,
    sha: run.head_sha,
    result: run.conclusion ?? 'in_progress',
    deployment: /staging deployment/i.test(run.name)
      ? { environment: 'staging', sha: run.head_sha }
      : /production release/i.test(run.name)
        ? { environment: 'production', sha: run.head_sha }
        : null,
    metric,
  };
}

export async function exportWorkflowMetrics(
  record: ReturnType<typeof workflowRunRecord>,
  options: WorkflowMetricExportOptions = {},
): Promise<void> {
  const exporter =
    options.exporter ?? createGrafanaExporter(options.endpoint, options.authorization);
  const retryingExporter = new RetryingMetricExporter(exporter, options.retry);
  const reader = new PeriodicExportingMetricReader({
    exporter: retryingExporter,
    exportIntervalMillis: 60_000,
    exportTimeoutMillis: 20_000,
  });
  const provider = new MeterProvider({ readers: [reader] });
  const meter = provider.getMeter('cafeteria.delivery-telemetry', '1.0.0');
  const branch = record.branch === 'main' ? 'main' : 'non-main';
  const attributes = {
    workflow: record.workflow,
    branch,
    conclusion: record.result,
  };
  meter
    .createGauge('github_workflow_duration_seconds', {
      description: 'Duration of a GitHub Actions workflow run.',
      unit: 's',
    })
    .record(record.metric.value, attributes);
  meter
    .createGauge('github_workflow_run_info', {
      description: 'Provenance for a workflow run; value is always one.',
      unit: '1',
    })
    .record(1, { ...attributes, sha: record.sha, run_id: String(record.workflowRunId) });
  meter
    .createCounter('github_workflow_runs', {
      description: 'Number of workflow runs by outcome.',
      unit: '1',
    })
    .add(1, attributes);
  if (record.deployment) {
    meter
      .createGauge('deployment_duration_seconds', {
        description: 'Duration of a staging or production deployment workflow.',
        unit: 's',
      })
      .record(record.metric.value, { ...attributes, environment: record.deployment.environment });
    meter
      .createGauge('deployment_info', {
        description: 'Deployment provenance; value is always one.',
        unit: '1',
      })
      .record(1, {
        ...attributes,
        environment: record.deployment.environment,
        sha: record.deployment.sha,
        run_id: String(record.workflowRunId),
      });
  }

  await provider.shutdown();
  if (retryingExporter.lastFailure) {
    throw new Error(`Grafana export failed after ${retryingExporter.maxAttempts} attempts.`, {
      cause: retryingExporter.lastFailure,
    });
  }
}

export async function persistWorkflowRunRecord(
  outputPath: string,
  record: ReturnType<typeof workflowRunRecord>,
): Promise<void> {
  const serialized = `${JSON.stringify(record)}\n`;
  await appendFile(outputPath, serialized, 'utf8').catch(async (error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeFile(outputPath, serialized, 'utf8');
  });
}

function createGrafanaExporter(endpoint?: string, authorization?: string): PushMetricExporter {
  if (!endpoint || !authorization) {
    throw new Error('Grafana OTLP endpoint and authorization are required for metric export.');
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') {
    throw new Error('Grafana OTLP endpoint must use HTTPS.');
  }
  return new OTLPMetricExporter({ url: url.toString(), headers: { Authorization: authorization } });
}

async function main(): Promise<void> {
  const inputPath = process.env.GITHUB_EVENT_PATH;
  const outputPath = process.env.GITHUB_OUTPUT_FILE ?? 'telemetry.jsonl';
  if (!inputPath) throw new Error('GITHUB_EVENT_PATH is required.');
  const payload = JSON.parse(await readFile(inputPath, 'utf8')) as { workflow_run?: WorkflowRun };
  const run = payload.workflow_run;
  if (!run || !Number.isInteger(run.id) || !/^[0-9a-f]{40}$/i.test(run.head_sha)) {
    throw new Error('Event payload must include a workflow run id and immutable commit SHA.');
  }
  const record = workflowRunRecord(run);
  const metric = record.metric;
  await persistWorkflowRunRecord(outputPath, record);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\nWorkflow ${run.name} (${run.head_sha}) reported ${record.result} in ${metric.value.toFixed(0)} seconds.\n`,
    );
  }
  const endpoint = process.env.GRAFANA_OTLP_METRICS_ENDPOINT;
  const authorization = process.env.GRAFANA_OTLP_AUTHORIZATION;
  if (!endpoint || !authorization) {
    console.warn(
      '::warning::Grafana OTLP is not configured; telemetry remains in the retained artifact.',
    );
    return;
  }
  try {
    await exportWorkflowMetrics(record, { endpoint, authorization });
    console.log('Grafana OTLP export succeeded.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OTLP export failure.';
    console.warn(`::warning::${message} Telemetry remains in the retained artifact for retry.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unable to record telemetry.');
    process.exitCode = 1;
  });
}
