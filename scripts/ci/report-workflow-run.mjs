import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const allowedStatuses = new Set(['queued', 'in_progress', 'success', 'failure', 'cancelled']);

export function normalizeJob(job, now = Date.now()) {
  let status;
  if (job.status === 'completed') {
    status =
      job.conclusion === 'success'
        ? 'success'
        : job.conclusion === 'cancelled'
          ? 'cancelled'
          : 'failure';
  } else if (job.status === 'in_progress') {
    status = 'in_progress';
  } else {
    status = 'queued';
  }
  if (!allowedStatuses.has(status))
    throw new Error(`Unsupported job state for ${job.name}: ${status}`);
  const start = job.started_at ? Date.parse(job.started_at) : undefined;
  const end = job.completed_at ? Date.parse(job.completed_at) : now;
  const durationMs =
    Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
  return {
    name: job.name,
    status,
    conclusion: job.conclusion ?? null,
    durationMs,
    htmlUrl: job.html_url,
  };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!token || !repository || !runId || !summaryPath)
    throw new Error('GitHub token, repository, run ID and step summary are required.');

  const jobs = [];
  let page = 1;
  while (true) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/runs/${runId}/jobs?per_page=100&page=${page}`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
        },
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub Actions jobs API returned ${response.status}; reporting fails closed.`,
      );
    const result = await response.json();
    jobs.push(...result.jobs);
    if (jobs.length >= result.total_count || result.jobs.length === 0) break;
    page += 1;
  }
  if (!jobs.length) throw new Error('GitHub returned no job records for this workflow run.');

  const now = Date.now();
  const report = jobs.map((job) => normalizeJob(job, now));
  const table = [
    '| Job | Status | Duration (s) | Result |',
    '| --- | --- | ---: | --- |',
    ...report.map(
      (job) =>
        `| [${job.name}](${job.htmlUrl}) | ${job.status} | ${job.durationMs === null ? '—' : (job.durationMs / 1000).toFixed(1)} | ${job.conclusion ?? 'pending'} |`,
    ),
  ].join('\n');
  await appendFile(
    summaryPath,
    `\n### PR check statuses and durations\n\n${table}\n\nRun: ${runId}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.some((job) => job.status === 'failure' || job.status === 'cancelled'))
    process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error::${message}\n`);
    process.exitCode = 1;
  });
}
