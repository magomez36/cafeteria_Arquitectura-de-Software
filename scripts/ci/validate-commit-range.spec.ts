import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { main, validationBudgetMs } from './validate-commit-range.js';

const verifiedBase = '437b02df447d0a4611b9cea601a69750c27cceb9';
const verifiedHead = 'bd01bd9b502923b91164bb29972121c670eb590c';

test('scales commit validation budget by groups of ten without relaxing the typical PR target', () => {
  const minute = 60 * 1000;
  assert.equal(validationBudgetMs(1), 15 * minute);
  assert.equal(validationBudgetMs(10), 15 * minute);
  assert.equal(validationBudgetMs(11), 30 * minute);
  assert.equal(validationBudgetMs(20), 30 * minute);
  assert.equal(validationBudgetMs(26), 45 * minute);
});

test('validates a documentation-only commit range and reports every check state', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'commit-range-policy-'));
  const summary = path.join(directory, 'summary.md');
  const previous = {
    base: process.env.BASE_SHA,
    head: process.env.HEAD_SHA,
    summary: process.env.GITHUB_STEP_SUMMARY,
  };
  process.env.BASE_SHA = verifiedBase;
  process.env.HEAD_SHA = verifiedHead;
  process.env.GITHUB_STEP_SUMMARY = summary;
  try {
    await main();
    const report = await readFile(summary, 'utf8');
    assert.match(report, /Commit-by-commit validation/);
    assert.match(report, /success/);
    assert.match(report, /commitlint: success/);
  } finally {
    await rm(directory, { recursive: true, force: true });
    if (previous.base === undefined) delete process.env.BASE_SHA;
    else process.env.BASE_SHA = previous.base;
    if (previous.head === undefined) delete process.env.HEAD_SHA;
    else process.env.HEAD_SHA = previous.head;
    if (previous.summary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous.summary;
  }
});

test('rejects missing and abbreviated commit range identifiers', async () => {
  const previousBase = process.env.BASE_SHA;
  const previousHead = process.env.HEAD_SHA;
  try {
    delete process.env.BASE_SHA;
    process.env.HEAD_SHA = verifiedHead;
    await assert.rejects(main(), /full commit SHAs/);
    process.env.BASE_SHA = '437b02d';
    await assert.rejects(main(), /full commit SHAs/);
  } finally {
    if (previousBase === undefined) delete process.env.BASE_SHA;
    else process.env.BASE_SHA = previousBase;
    if (previousHead === undefined) delete process.env.HEAD_SHA;
    else process.env.HEAD_SHA = previousHead;
  }
});

test('rejects a valid but empty commit range', async () => {
  const previousBase = process.env.BASE_SHA;
  const previousHead = process.env.HEAD_SHA;
  process.env.BASE_SHA = verifiedHead;
  process.env.HEAD_SHA = verifiedHead;
  try {
    await assert.rejects(main(), /commit range is empty/);
  } finally {
    if (previousBase === undefined) delete process.env.BASE_SHA;
    else process.env.BASE_SHA = previousBase;
    if (previousHead === undefined) delete process.env.HEAD_SHA;
    else process.env.HEAD_SHA = previousHead;
  }
});
