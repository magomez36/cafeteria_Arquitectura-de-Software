import { appendFile, readFile, writeFile } from 'node:fs/promises';
import {
  validateTelemetryMetric,
  type TelemetryMetric,
} from '../../packages/contracts/src/telemetry.schema.js';

interface WorkflowRun {
  readonly id: number;
  readonly name: string;
  readonly head_sha: string;
  readonly head_branch: string;
  readonly conclusion: string | null;
  readonly run_started_at: string;
  readonly updated_at: string;
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
  await appendFile(outputPath, `${JSON.stringify(record)}\n`, 'utf8').catch(
    async (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await writeFile(outputPath, `${JSON.stringify(record)}\n`, 'utf8');
    },
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\nWorkflow ${run.name} (${run.head_sha}) reported ${record.result} in ${metric.value.toFixed(0)} seconds.\n`,
    );
  }
}

if (process.env.GITHUB_EVENT_PATH) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unable to record telemetry.');
    process.exitCode = 1;
  });
}
