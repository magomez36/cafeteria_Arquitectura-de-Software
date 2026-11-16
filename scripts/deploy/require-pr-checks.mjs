const requiredChecks = [
  'quality',
  'security / codeql',
  'security / dependency-audit',
  'security / secret-scan',
  'images',
  'pr-report',
];

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_HEAD_SHA } = process.env;
if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_HEAD_SHA) {
  throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY, and PR_HEAD_SHA are required.');
}

const apiUrl = `https://api.github.com/repos/${GITHUB_REPOSITORY}/commits/${PR_HEAD_SHA}/check-runs?per_page=100`;
const deadline = Date.now() + 12 * 60 * 1000;

while (Date.now() < deadline) {
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
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
    return check && (check.status !== 'completed' || check.conclusion !== 'success');
  });
  const failed = unfinished.filter((name) => checks.get(name)?.status === 'completed');

  if (failed.length > 0) {
    throw new Error(
      `Required PR checks failed: ${failed.map((name) => `${name}=${checks.get(name)?.conclusion}`).join(', ')}`,
    );
  }
  if (missing.length === 0 && unfinished.length === 0) {
    console.log(`All required checks passed for ${PR_HEAD_SHA}.`);
    process.exit(0);
  }

  console.log(
    `Waiting for required checks. Missing: ${missing.join(', ') || 'none'}; pending: ${unfinished.join(', ') || 'none'}.`,
  );
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}

throw new Error('Required PR checks did not all succeed within 12 minutes.');
