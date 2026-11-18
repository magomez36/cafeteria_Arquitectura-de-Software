import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildRevertPatch } from './revert-drill.mjs';

test('prepares an application reversal without changing the source tree or migration files', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'cafeteria-revert-fixture-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const app = 'apps/api/src/example.txt';
  const migration = 'apps/api/src/modules/example/migrations/20261117150000_expand.ts';
  const save = async (file, content) => {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await writeFile(path.join(cwd, file), `${content}\n`);
    git('add', '--', file);
    git('commit', '-m', 'test: prepare synthetic drill fixture');
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init');
    git('config', 'user.name', 'Cafeteria Test');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    const base = await save(app, 'previous');
    const release = await save(app, 'candidate');
    const schema = await save(migration, 'fixture migration');
    const patch = await buildRevertPatch(cwd, release);
    assert.match(patch, /^-candidate\r?$/m);
    assert.match(patch, /^\+previous\r?$/m);
    assert.doesNotMatch(patch, /migrations/);
    assert.equal(git('rev-parse', 'HEAD'), schema);
    assert.equal(git('status', '--porcelain'), '');
    assert.equal((await readFile(path.join(cwd, app), 'utf8')).trim(), 'candidate');
    await assert.rejects(buildRevertPatch(cwd, schema), /application-only commit/);
    await assert.rejects(buildRevertPatch(cwd, base), /merge or root/);
    await assert.rejects(buildRevertPatch(cwd, 'HEAD'), /full SHA/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
