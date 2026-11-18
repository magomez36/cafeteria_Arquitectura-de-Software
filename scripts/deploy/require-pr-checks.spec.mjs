import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requiredChecks, verifyRequiredChecks } from './require-pr-checks.mjs';

const successCheckRuns = requiredChecks.map((name) => ({
  name,
  status: 'completed',
  conclusion: 'success',
}));

test('accepts the exact required checks only when all are completed successfully', async () => {
  const result = await verifyRequiredChecks({
    token: 'test-token',
    repository: 'cafeteria/example',
    headSha: 'a'.repeat(40),
    fetchChecks: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      return new Response(JSON.stringify({ check_runs: successCheckRuns }), { status: 200 });
    },
  });
  assert.match(result, /All required checks passed/);
});

test('permits an inapplicable image job only while the security and aggregate checks pass', async () => {
  const options = (auditConclusion) => ({
    token: 'test-token',
    repository: 'cafeteria/example',
    headSha: 'a'.repeat(40),
    fetchChecks: async () =>
      Response.json({
        check_runs: successCheckRuns.map((check) => {
          if (check.name === 'images') return { ...check, conclusion: 'skipped' };
          if (check.name === 'security / dependency-audit')
            return { ...check, conclusion: auditConclusion };
          return check;
        }),
      }),
  });
  await assert.doesNotReject(verifyRequiredChecks(options('success')));
  await assert.rejects(verifyRequiredChecks(options('skipped')), /dependency-audit=skipped/);
  await assert.rejects(verifyRequiredChecks(options('failure')), /dependency-audit=failure/);
});

test('blocks completed failed checks and fails closed on API errors or missing identity', async () => {
  await assert.rejects(
    verifyRequiredChecks({
      token: 'test-token',
      repository: 'cafeteria/example',
      headSha: 'b'.repeat(40),
      fetchChecks: async () =>
        new Response(
          JSON.stringify({
            check_runs: successCheckRuns.map((check) =>
              check.name === 'quality' ? { ...check, conclusion: 'failure' } : check,
            ),
          }),
          { status: 200 },
        ),
    }),
    /quality=failure/,
  );
  await assert.rejects(
    verifyRequiredChecks({
      token: 'test-token',
      repository: 'cafeteria/example',
      headSha: 'c'.repeat(40),
      fetchChecks: async () => new Response('', { status: 403 }),
    }),
    /API returned 403/,
  );
  await assert.rejects(
    verifyRequiredChecks({ token: '', repository: 'cafeteria/example', headSha: 'd'.repeat(40) }),
    /are required/,
  );
});

test('blocks the required CodeQL check even if the reusable CodeQL job passed', async () => {
  await assert.rejects(
    verifyRequiredChecks({
      token: 'test-token',
      repository: 'cafeteria/example',
      headSha: 'a'.repeat(40),
      fetchChecks: async () =>
        Response.json({
          check_runs: successCheckRuns.map((check) =>
            check.name === 'CodeQL' ? { ...check, conclusion: 'failure' } : check,
          ),
        }),
    }),
    /CodeQL=failure/,
  );
});

test('waits for missing or pending checks and times out without treating them as success', async () => {
  let calls = 0;
  let nowCalls = 0;
  const times = [0, 1, 720_000];
  const now = () => times[nowCalls++] ?? 720_000;
  await assert.rejects(
    verifyRequiredChecks({
      token: 'test-token',
      repository: 'cafeteria/example',
      headSha: 'e'.repeat(40),
      now,
      wait: async () => undefined,
      fetchChecks: async () => {
        calls += 1;
        return new Response(JSON.stringify({ check_runs: [] }), { status: 200 });
      },
    }),
    /did not all succeed within 12 minutes/,
  );
  assert.equal(calls, 1);
});
