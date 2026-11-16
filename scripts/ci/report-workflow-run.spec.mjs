import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { main, normalizeJob } from './report-workflow-run.mjs';

test('workflow job statuses normalize to the documented check states', () => {
  assert.equal(normalizeJob({ name: 'build', status: 'queued' }).status, 'queued');
  assert.equal(
    normalizeJob(
      { name: 'build', status: 'in_progress', started_at: '2026-11-15T00:00:00Z' },
      Date.parse('2026-11-15T00:00:04Z'),
    ).status,
    'in_progress',
  );
  assert.equal(
    normalizeJob({ name: 'build', status: 'completed', conclusion: 'success' }).status,
    'success',
  );
  assert.equal(
    normalizeJob({ name: 'build', status: 'completed', conclusion: 'failure' }).status,
    'failure',
  );
  assert.equal(
    normalizeJob({ name: 'build', status: 'completed', conclusion: 'cancelled' }).status,
    'cancelled',
  );
});

test('workflow job durations are calculated from actual start and completion timestamps', () => {
  const job = normalizeJob({
    name: 'quality',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-11-15T00:00:00Z',
    completed_at: '2026-11-15T00:00:12Z',
  });
  assert.equal(job.durationMs, 12000);
  assert.equal(normalizeJob({ name: 'queued', status: 'queued' }).durationMs, null);
});

test('reports successful job states from GitHub and records the elapsed time', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workflow-report-'));
  const summaryPath = path.join(directory, 'summary.md');
  await writeFile(summaryPath, '', 'utf8');
  const previousEnvironment = {
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    summary: process.env.GITHUB_STEP_SUMMARY,
  };
  const previousFetch = globalThis.fetch;
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPOSITORY = 'cafeteria/example';
  process.env.GITHUB_RUN_ID = '7';
  process.env.GITHUB_STEP_SUMMARY = summaryPath;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        total_count: 1,
        jobs: [
          {
            name: 'quality',
            status: 'completed',
            conclusion: 'success',
            started_at: '2026-11-15T00:00:00Z',
            completed_at: '2026-11-15T00:00:02Z',
            html_url: 'https://github.com/cafeteria/example/actions/runs/7',
          },
        ],
      }),
      { status: 200 },
    );
  try {
    await main();
    assert.match(await readFile(summaryPath, 'utf8'), /quality.*success/);
  } finally {
    globalThis.fetch = previousFetch;
    await rm(directory, { recursive: true, force: true });
    if (previousEnvironment.token === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousEnvironment.token;
    if (previousEnvironment.repository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previousEnvironment.repository;
    if (previousEnvironment.runId === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = previousEnvironment.runId;
    if (previousEnvironment.summary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previousEnvironment.summary;
  }
});

test('fails closed when GitHub report credentials or run metadata are missing', async () => {
  const previous = {
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    summary: process.env.GITHUB_STEP_SUMMARY,
  };
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_RUN_ID;
  delete process.env.GITHUB_STEP_SUMMARY;
  try {
    await assert.rejects(main(), /token, repository, run ID and step summary are required/);
  } finally {
    if (previous.token === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previous.token;
    if (previous.repository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previous.repository;
    if (previous.runId === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = previous.runId;
    if (previous.summary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous.summary;
  }
});

test('loads additional pages when a workflow has more than one hundred jobs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workflow-report-pages-'));
  const summaryPath = path.join(directory, 'summary.md');
  await writeFile(summaryPath, '', 'utf8');
  const previousEnvironment = {
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    summary: process.env.GITHUB_STEP_SUMMARY,
  };
  const previousFetch = globalThis.fetch;
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPOSITORY = 'cafeteria/example';
  process.env.GITHUB_RUN_ID = '8';
  process.env.GITHUB_STEP_SUMMARY = summaryPath;
  const pages = [];
  globalThis.fetch = async (url) => {
    pages.push(String(url));
    const pageNumber = pages.length;
    return new Response(
      JSON.stringify({
        total_count: 2,
        jobs: [
          {
            name: `job-${pageNumber}`,
            status: 'completed',
            conclusion: 'success',
            html_url: 'https://github.com/cafeteria/example/actions/runs/8',
          },
        ],
      }),
      { status: 200 },
    );
  };
  try {
    await main();
    assert.equal(pages.length, 2);
    assert.match(pages[1], /page=2/);
    assert.match(await readFile(summaryPath, 'utf8'), /job-2/);
  } finally {
    globalThis.fetch = previousFetch;
    await rm(directory, { recursive: true, force: true });
    if (previousEnvironment.token === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousEnvironment.token;
    if (previousEnvironment.repository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previousEnvironment.repository;
    if (previousEnvironment.runId === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = previousEnvironment.runId;
    if (previousEnvironment.summary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previousEnvironment.summary;
  }
});

test('fails closed when the jobs API fails or returns no jobs', async () => {
  const previousEnvironment = {
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    summary: process.env.GITHUB_STEP_SUMMARY,
  };
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPOSITORY = 'cafeteria/example';
  process.env.GITHUB_RUN_ID = '9';
  process.env.GITHUB_STEP_SUMMARY = 'unused-summary.md';
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status: 500 });
    await assert.rejects(main(), /returned 500/);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ total_count: 0, jobs: [] }), { status: 200 });
    await assert.rejects(main(), /no job records/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnvironment.token === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousEnvironment.token;
    if (previousEnvironment.repository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previousEnvironment.repository;
    if (previousEnvironment.runId === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = previousEnvironment.runId;
    if (previousEnvironment.summary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previousEnvironment.summary;
  }
});
