import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { classifyAffectedFiles, main } from './detect-affected.js';
import { gitExecutable } from './git-executable.mjs';
import { affectedWorkspaces } from './validate-commit-range.js';

const verifiedBase = '437b02df447d0a4611b9cea601a69750c27cceb9';
const verifiedHead = 'bd01bd9b502923b91164bb29972121c670eb590c';

test('classifies package and workspace changes without widening unrelated checks', () => {
  assert.deepEqual(classifyAffectedFiles(['apps/web/src/app/page.tsx']), {
    hasCode: true,
    apiChanged: false,
    workerChanged: false,
  });
  assert.deepEqual(classifyAffectedFiles(['apps/api/src/main.ts']), {
    hasCode: true,
    apiChanged: true,
    workerChanged: false,
  });
  assert.deepEqual(classifyAffectedFiles(['apps/worker/src/main.ts']), {
    hasCode: true,
    apiChanged: false,
    workerChanged: true,
  });
  assert.deepEqual(classifyAffectedFiles(['README.md']), {
    hasCode: false,
    apiChanged: false,
    workerChanged: false,
  });
});

test('global manifests select every workspace', () => {
  assert.deepEqual(
    affectedWorkspaces(['pnpm-lock.yaml']),
    [
      '@cafeteria/api',
      '@cafeteria/web',
      '@cafeteria/worker',
      '@cafeteria/contracts',
      '@cafeteria/feature-flags',
      '@cafeteria/ui',
    ].sort((left, right) => left.localeCompare(right)),
  );
});

test('fixed Git executable resolves to an existing absolute path', () => {
  const executable = gitExecutable();
  assert.ok(path.isAbsolute(executable));
  assert.ok(existsSync(executable));
  assert.match(executable, /(?:git\.exe|\/git)$/);
  assert.equal(
    gitExecutable('win32', (candidate) => candidate === 'C:\\Program Files\\Git\\cmd\\git.exe'),
    'C:\\Program Files\\Git\\cmd\\git.exe',
  );
  assert.throws(
    () => gitExecutable('win32', () => false),
    /not found in a supported fixed location/,
  );
});

test('writes affected flags for a real documentation-only commit range', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'affected-policy-'));
  const output = path.join(directory, 'output.txt');
  const previous = {
    base: process.env.BASE_SHA,
    head: process.env.HEAD_SHA,
    output: process.env.GITHUB_OUTPUT,
  };
  process.env.BASE_SHA = verifiedBase;
  process.env.HEAD_SHA = verifiedHead;
  process.env.GITHUB_OUTPUT = output;
  try {
    await main();
    assert.match(await readFile(output, 'utf8'), /has_code=false\napi=false\nworker=false/);
  } finally {
    await rm(directory, { recursive: true, force: true });
    if (previous.base === undefined) delete process.env.BASE_SHA;
    else process.env.BASE_SHA = previous.base;
    if (previous.head === undefined) delete process.env.HEAD_SHA;
    else process.env.HEAD_SHA = previous.head;
    if (previous.output === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = previous.output;
  }
});
