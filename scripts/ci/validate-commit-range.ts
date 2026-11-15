import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function affectedWorkspace(commit: string): string[] {
  const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', commit)
    .split(/\r?\n/)
    .filter(Boolean);
  const workspaces = new Set<string>();
  for (const file of files) {
    if (file.startsWith('apps/api/')) workspaces.add('@cafeteria/api');
    else if (file.startsWith('apps/web/')) workspaces.add('@cafeteria/web');
    else if (file.startsWith('apps/worker/')) workspaces.add('@cafeteria/worker');
    else if (file.startsWith('packages/contracts/')) workspaces.add('@cafeteria/contracts');
    else if (file.startsWith('packages/ui/')) workspaces.add('@cafeteria/ui');
    else if (
      /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|packages\/tsconfig\/)/.test(
        file,
      )
    ) {
      for (const name of [
        '@cafeteria/api',
        '@cafeteria/web',
        '@cafeteria/worker',
        '@cafeteria/contracts',
        '@cafeteria/ui',
      ])
        workspaces.add(name);
    }
  }
  return [...workspaces].sort();
}

async function main(): Promise<void> {
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA;
  if (!base || !head || !/^[0-9a-f]{40}$/i.test(base) || !/^[0-9a-f]{40}$/i.test(head)) {
    throw new Error(
      'BASE_SHA and HEAD_SHA must be full commit SHAs supplied by the pull_request event.',
    );
  }
  const commits = git('rev-list', '--reverse', `${base}..${head}`).split(/\r?\n/).filter(Boolean);
  if (!commits.length) throw new Error('The pull request commit range is empty.');
  const require = createRequire(import.meta.url);
  const commitlintCli = path.join(path.dirname(require.resolve('@commitlint/cli')), 'cli.js');
  const started = Date.now();
  const report: Array<Record<string, unknown>> = [];
  for (const sha of commits) {
    const commitStarted = Date.now();
    const message = git('show', '-s', '--format=%B', sha);
    try {
      execFileSync(process.execPath, [commitlintCli], {
        cwd: process.cwd(),
        input: message,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      throw new Error(`Conventional Commit check failed for ${sha}: ${stderr}`);
    }
    report.push({
      sha,
      status: 'success',
      job: 'commitlint',
      durationMs: Date.now() - commitStarted,
      affectedWorkspaces: affectedWorkspace(sha),
    });
  }
  const output = {
    base,
    head,
    commitCount: commits.length,
    status: 'success',
    durationMs: Date.now() - started,
    commits: report,
  };
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const fs = await import('node:fs/promises');
    await fs.appendFile(
      summaryPath,
      `\n### Commit range validation\n\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\`\n`,
    );
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`::error::${message}\n`);
  process.exitCode = 1;
});
