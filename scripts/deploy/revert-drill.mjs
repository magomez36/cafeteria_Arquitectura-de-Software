import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export async function buildRevertPatch(repository, sha) {
  if (typeof sha !== 'string' || sha.length !== 40 || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('The drill requires the full SHA of a merged single-parent commit.');
  }
  const base = git(repository, 'rev-parse', 'HEAD').trim();
  git(repository, 'merge-base', '--is-ancestor', sha, base);
  const parents = git(repository, 'rev-list', '--parents', '-n', '1', sha).trim().split(/\s+/);
  if (parents.length !== 2) throw new Error('The drill does not accept merge or root commits.');
  const allowsOnlyApplicationCode = (files) =>
    files
      .split('\0')
      .filter(Boolean)
      .every(
        (file) =>
          /^(apps\/(?:api|web|worker)\/src|packages\/[a-z-]+\/src)\//.test(file) &&
          !/(^|\/)(database|migrations)(\/|$)/i.test(file),
      );
  const original = git(
    repository,
    'diff-tree',
    '--no-commit-id',
    '--no-renames',
    '-r',
    '--name-only',
    '-z',
    sha,
  );
  if (!original || !allowsOnlyApplicationCode(original)) {
    throw new Error('Select an application-only commit without database or workflow changes.');
  }

  const sandbox = await mkdtemp(path.join(tmpdir(), 'cafeteria-revert-drill-'));
  try {
    git(
      sandbox,
      'clone',
      '--local',
      '--no-checkout',
      '--quiet',
      '--',
      path.resolve(repository),
      '.',
    );
    git(sandbox, 'checkout', '--detach', '--quiet', base);
    git(sandbox, 'revert', '--no-commit', sha);
    const paths = git(sandbox, 'diff', '--cached', '--no-renames', '--name-only', '-z');
    if (!paths || !allowsOnlyApplicationCode(paths))
      throw new Error('The revert has no safe application diff.');
    return git(sandbox, 'diff', '--cached', '--binary', '--full-index');
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(await buildRevertPatch(process.cwd(), process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
