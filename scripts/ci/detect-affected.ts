import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitExecutable } from './git-executable.js';

export function classifyAffectedFiles(files: string[]) {
  const codePatterns = [
    /^apps\//,
    /^packages\//,
    /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|\.github\/workflows\/)/,
    /^(eslint|prettier|tsconfig|commitlint)/,
  ];
  const hasCode = files.some((file) => codePatterns.some((pattern) => pattern.test(file)));
  const repoWide = files.some((file) =>
    /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json)$/.test(file),
  );
  const apiChanged =
    repoWide ||
    files.some((file) =>
      /^(apps\/api\/|packages\/contracts\/|packages\/tsconfig\/|\.dockerignore$)/.test(file),
    );
  const workerChanged =
    repoWide ||
    files.some((file) => /^(apps\/worker\/|packages\/tsconfig\/|\.dockerignore$)/.test(file));
  return { hasCode, apiChanged, workerChanged };
}

export async function main(): Promise<void> {
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA;
  if (!base || !head) throw new Error('BASE_SHA and HEAD_SHA are required.');
  const files = execFileSync(gitExecutable(), ['diff', '--name-only', `${base}...${head}`], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const { hasCode, apiChanged, workerChanged } = classifyAffectedFiles(files);
  process.stdout.write(`Affected paths: ${files.length}; executable checks: ${hasCode}\n`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `has_code=${hasCode}\napi=${apiChanged}\nworker=${workerChanged}\n`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error::${message}\n`);
    process.exitCode = 1;
  });
}
