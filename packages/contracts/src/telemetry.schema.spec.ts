import { describe, expect, it } from 'vitest';
import { validateTelemetryMetric, type TelemetryMetric } from './telemetry.schema';

const validMetric: TelemetryMetric = {
  name: 'deployment-frequency',
  value: 2,
  unit: 'deployments/day',
  source: 'deployment',
  freshnessSeconds: 120,
  periodStart: '2026-11-14T00:00:00.000Z',
  periodEnd: '2026-11-15T00:00:00.000Z',
  collectedAt: '2026-11-15T00:01:00.000Z',
  subject: { type: 'team' },
};

describe('telemetry schema', () => {
  it('accepts sourced team telemetry with value, units, freshness, period and collection time', () => {
    expect(validateTelemetryMetric(validMetric)).toEqual([]);
  });

  it('requires access authorization and notice for individual telemetry', () => {
    expect(
      validateTelemetryMetric({
        ...validMetric,
        subject: { type: 'person', subjectId: '', accessAuthorized: true, noticeGiven: true },
      }),
    ).toContain('individual telemetry requires an identified, authorized subject and prior notice');
  });

  it('rejects individual ranking and quality inferred from commit counts', () => {
    const individual = {
      type: 'person' as const,
      subjectId: 'authorized-user',
      accessAuthorized: true as const,
      noticeGiven: true as const,
    };
    expect(
      validateTelemetryMetric({
        ...validMetric,
        name: 'individual-quality-from-commit-count',
        subject: individual,
      }),
    ).toContain('individual ranking and commit-count-based quality inference are prohibited');
    expect(
      validateTelemetryMetric({
        ...validMetric,
        name: 'commit quality inferred for an individual',
        subject: individual,
      }),
    ).toContain('individual ranking and commit-count-based quality inference are prohibited');
    expect(
      validateTelemetryMetric({
        ...validMetric,
        name: 'team-ranking',
        subject: individual,
      }),
    ).toContain('individual ranking and commit-count-based quality inference are prohibited');
  });

  it('rejects malformed or reversed collection periods', () => {
    expect(
      validateTelemetryMetric({
        ...validMetric,
        periodStart: 'bad-date',
        periodEnd: '2026-11-14T00:00:00.000Z',
      }),
    ).toContain('period and collectedAt must be valid timestamps');
    expect(
      validateTelemetryMetric({
        ...validMetric,
        periodStart: '2026-11-15T00:00:00.000Z',
        periodEnd: '2026-11-14T00:00:00.000Z',
      }),
    ).toContain('periodEnd must not precede periodStart');
  });
});
