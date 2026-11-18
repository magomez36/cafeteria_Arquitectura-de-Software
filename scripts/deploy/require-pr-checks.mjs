import { pathToFileURL } from 'node:url';

export const requiredChecks = [
  'quality',
  'CodeQL',
  'security / codeql',
  'security / dependency-audit',
  'security / secret-scan',
  'images',
  'pr-report',
];

export async function verifyRequiredChecks({
  token,
  repository,
  headSha,
  fetchChecks = fetch,
  now = Date.now,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  if (!token || !repository || !headSha) {
    throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY, and PR_HEAD_SHA are required.');
  }
  const apiUrl = `https://api.github.com/repos/${repository}/commits/${headSha}/check-runs?per_page=100`;
  const deadline = now() + 12 * 60 * 1000;

  while (now() < deadline) {
    const response = await fetchChecks(apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GitHub check-runs API returned ${response.status}.`);

    const result = await response.json();
    const checks = new Map(
      result.check_runs.map(({ name, status, conclusion }) => [name, { status, conclusion }]),
    );
    const missing = requiredChecks.filter((name) => !checks.has(name));
    const unfinished = requiredChecks.filter((name) => {
      const check = checks.get(name);
      return (
        check &&
        (check.status !== 'completed' ||
          !(
            check.conclusion === 'success' ||
            (name === 'images' && check.conclusion === 'skipped')
          ))
      );
    });
    const failed = unfinished.filter((name) => checks.get(name)?.status === 'completed');

    if (failed.length > 0) {
      throw new Error(
        `Required PR checks failed: ${failed.map((name) => `${name}=${checks.get(name)?.conclusion}`).join(', ')}`,
      );
    }
    if (missing.length === 0 && unfinished.length === 0) {
      return `All required checks passed for ${headSha}.`;
    }

    await wait(15_000);
  }

  throw new Error('Required PR checks did not all succeed within 12 minutes.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRequiredChecks({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    headSha: process.env.PR_HEAD_SHA,
  })
    .then((message) => console.log(message))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
