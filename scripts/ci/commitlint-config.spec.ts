import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function validate(message: string): boolean {
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve('@commitlint/cli')), 'cli.js');
  const result = spawnSync(process.execPath, [cli], {
    cwd: root,
    input: message,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

test('commit messages require a conventional type, an allowed scope and a description', () => {
  assert.equal(validate('feat(api): add health endpoint'), true);
  assert.equal(validate('feat(platform): bootstrap platform'), true);
  assert.equal(validate('feat: add health endpoint'), false);
  assert.equal(validate('feat(unknown): add health endpoint'), false);
  assert.equal(validate('feat(api):'), false);
});

test('merge and revert commits are explicit conventional-commit exceptions', async () => {
  const source = await readFile(path.join(root, 'commitlint.config.cjs'), 'utf8');
  assert.match(source, /defaultIgnores\s*:\s*true/);
  assert.match(source, /Merge pull request|merge commit/i);
  assert.match(source, /revert/i);
  assert.equal(validate('Merge pull request #12 from cafeteria/feature/health'), true);
  assert.equal(validate('revert(api): restore previous health behavior'), true);
});

test('commit policy documents atomic intent and human review', async () => {
  const source = await readFile(path.join(root, 'docs/contributing/commit-policy.md'), 'utf8');
  assert.match(source, /one logical change/i);
  assert.match(source, /reviewers verify/i);
});
