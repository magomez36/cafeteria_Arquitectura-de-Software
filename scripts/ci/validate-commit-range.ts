import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isPostgresStartupTransientFailure } from './postgres-startup-retry.js';
import { gitExecutable } from './git-executable.mjs';

type Check = {
  name: string;
  status: 'queued' | 'in_progress' | 'success' | 'failure' | 'cancelled';
  durationMs: number | null;
};

type CommitResult = {
  sha: string;
  affectedWorkspaces: string[];
  status: 'queued' | 'in_progress' | 'success' | 'failure' | 'cancelled';
  durationMs: number;
  checks: Check[];
};

const workspacePaths = new Map([
  ['apps/api/', '@cafeteria/api'],
  ['apps/web/', '@cafeteria/web'],
  ['apps/worker/', '@cafeteria/worker'],
  ['packages/contracts/', '@cafeteria/contracts'],
  ['packages/feature-flags/', '@cafeteria/feature-flags'],
  ['packages/ui/', '@cafeteria/ui'],
]);

const allWorkspaces = [...workspacePaths.values()];
const globalConfig =
  /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|eslint\.config\.[^/]+|\.github\/workflows\/|scripts\/ci\/)/;
const policyFiles = /^(\.github\/workflows\/|scripts\/(ci|deploy|telemetry)\/)/;

export function validationBudgetMs(commitCount: number): number {
  return Math.ceil(commitCount / 10) * 15 * 60 * 1000;
}

function git(...args: string[]): string {
  return execFileSync(gitExecutable(), args, { encoding: 'utf8' }).trim();
}

export function affectedWorkspaces(files: string[]): string[] {
  const affected = new Set<string>();
  if (files.some((file) => globalConfig.test(file))) {
    for (const workspace of allWorkspaces) affected.add(workspace);
    return [...affected].sort((left, right) => left.localeCompare(right));
  }
  for (const file of files) {
    for (const [prefix, workspace] of workspacePaths) {
      if (file.startsWith(prefix)) affected.add(workspace);
    }
  }
  return [...affected].sort((left, right) => left.localeCompare(right));
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} ${args.join(' ')} terminated by ${result.signal}`);
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} exited with status ${String(result.status)}`);
}

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

export async function main(): Promise<void> {
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
  const results: CommitResult[] = [];

  for (const sha of commits) {
    const commitStarted = Date.now();
    const message = git('show', '-s', '--format=%B', sha);
    const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', sha)
      .split(/\r?\n/)
      .filter(Boolean);
    const workspaces = affectedWorkspaces(files);
    const result: CommitResult = {
      sha,
      affectedWorkspaces: workspaces,
      status: 'in_progress',
      durationMs: 0,
      checks: [{ name: 'commitlint', status: 'in_progress', durationMs: null }],
    };
    results.push(result);
    process.stdout.write(`::group::Validate ${sha}\n`);

    try {
      const commitlintStarted = Date.now();
      try {
        execFileSync(process.execPath, [commitlintCli], {
          cwd: process.cwd(),
          input: message,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        result.checks[0] = {
          name: 'commitlint',
          status: 'success',
          durationMs: Date.now() - commitlintStarted,
        };
      } catch (error) {
        const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
        result.checks[0] = {
          name: 'commitlint',
          status: 'failure',
          durationMs: Date.now() - commitlintStarted,
        };
        throw new Error(`Conventional Commit check failed for ${sha}: ${stderr}`);
      }

      if (workspaces.length > 0) {
        const worktree = await mkdtemp(path.join(os.tmpdir(), `cafeteria-${sha.slice(0, 7)}-`));
        try {
          run(
            'git',
            ['clone', '--quiet', '--shared', '--no-checkout', process.cwd(), worktree],
            process.cwd(),
          );
          run('git', ['checkout', '--quiet', '--detach', sha], worktree);
          const install: Check = { name: 'install', status: 'in_progress', durationMs: null };
          result.checks.push(install);
          const installStarted = Date.now();
          run(pnpmCommand(), ['install', '--frozen-lockfile'], worktree);
          install.status = 'success';
          install.durationMs = Date.now() - installStarted;

          if (!workspaces.every((workspace) => existsWorkspace(worktree, workspace))) {
            throw new Error(`Affected workspace manifests are missing at ${sha}.`);
          }

          const workspaceCheck: Check = {
            name: `lint/typecheck/test/build (${workspaces.join(', ')})`,
            status: 'in_progress',
            durationMs: null,
          };
          result.checks.push(workspaceCheck);
          const checksStarted = Date.now();
          run(
            pnpmCommand(),
            [
              'exec',
              'turbo',
              'run',
              'lint',
              'typecheck',
              'test',
              'build',
              ...workspaces.map((workspace) => `--filter=${workspace}`),
            ],
            worktree,
          );
          workspaceCheck.status = 'success';
          workspaceCheck.durationMs = Date.now() - checksStarted;

          for (const workspace of ['@cafeteria/api', '@cafeteria/worker']) {
            if (!workspaces.includes(workspace)) continue;
            const name = `${workspace} integration tests`;
            const integration: Check = { name, status: 'in_progress', durationMs: null };
            result.checks.push(integration);
            const integrationStarted = Date.now();
            const integrationArgs = ['--filter', workspace, 'test:integration'];
            let passed = false;
            for (let attempt = 1; attempt <= 2; attempt += 1) {
              const execution = spawnSync(pnpmCommand(), integrationArgs, {
                cwd: worktree,
                env: process.env,
                encoding: 'utf8',
                shell: process.platform === 'win32',
                stdio: ['inherit', 'pipe', 'pipe'],
              });
              if (execution.stdout) process.stdout.write(execution.stdout);
              if (execution.stderr) process.stderr.write(execution.stderr);
              if (execution.error) throw execution.error;
              if (execution.signal) {
                throw new Error(
                  `Integration tests terminated by ${execution.signal}: ${workspace}`,
                );
              }
              if (execution.status === 0) {
                passed = true;
                break;
              }
              const output = `${execution.stdout ?? ''}\n${execution.stderr ?? ''}`;
              if (
                attempt === 1 &&
                isPostgresStartupTransientFailure(execution.status, null, output)
              ) {
                process.stderr.write(
                  '::warning::PostgreSQL was still starting; retrying this integration suite once.\n',
                );
                continue;
              }
              throw new Error(
                `pnpm ${integrationArgs.join(' ')} exited with status ${String(execution.status)}${attempt > 1 ? ' after one PostgreSQL startup retry' : ''}`,
              );
            }
            if (!passed) throw new Error(`Integration tests did not pass for ${workspace}.`);
            integration.status = 'success';
            integration.durationMs = Date.now() - integrationStarted;
          }

          if (files.some((file) => policyFiles.test(file))) {
            const policy: Check = {
              name: 'CI policy tests',
              status: 'in_progress',
              durationMs: null,
            };
            result.checks.push(policy);
            const policyStarted = Date.now();
            const testEnvironment = { ...process.env };
            delete testEnvironment.GITHUB_EVENT_PATH;
            run(pnpmCommand(), ['test:ci'], worktree, testEnvironment);
            policy.status = 'success';
            policy.durationMs = Date.now() - policyStarted;
          }
        } catch (error) {
          const check = result.checks.find((item) => item.status === 'in_progress');
          if (check) {
            check.status = 'failure';
            check.durationMs ??= Date.now() - commitStarted;
          }
          result.status = 'failure';
          process.stderr.write(
            `::error::Commit ${sha} validation failed: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        } finally {
          await rm(worktree, { recursive: true, force: true });
        }
      }
    } catch (error) {
      result.status = 'failure';
      process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    }

    if (result.status !== 'failure') result.status = 'success';
    result.durationMs = Date.now() - commitStarted;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n::endgroup::\n`);
  }

  const output = {
    base,
    head,
    commitCount: commits.length,
    status: results.some((item) => item.status === 'failure') ? 'failure' : 'success',
    durationMs: Date.now() - started,
    commits: results,
  };
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const rows = results.map((item) => {
      const checks = item.checks.map((check) => `${check.name}: ${check.status}`).join('<br>');
      return `| ${item.sha.slice(0, 12)} | ${item.status} | ${item.durationMs} | ${checks} |`;
    });
    await appendFile(
      summaryPath,
      `\n### Commit-by-commit validation\n\n| Commit | Result | Duration (ms) | Checks |\n|---|---|---:|---|\n${rows.join('\n')}\n\nTotal: ${output.durationMs} ms; target <15 min for up to 10 commits.\n`,
    );
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.status === 'failure') process.exitCode = 1;
  const budgetMs = validationBudgetMs(commits.length);
  if (output.durationMs >= budgetMs) {
    const budgetMinutes = budgetMs / (60 * 1000);
    process.stderr.write(
      `::error::The ${commits.length}-commit range exceeded its ${budgetMinutes} minute validation budget.\n`,
    );
    process.exitCode = 1;
  }
}

function existsWorkspace(root: string, name: string): boolean {
  const relative = [...workspacePaths.entries()].find(([, workspace]) => workspace === name)?.[0];
  return relative !== undefined && existsSync(path.join(root, relative, 'package.json'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error::${message}\n`);
    process.exitCode = 1;
  });
}
