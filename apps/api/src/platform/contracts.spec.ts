import { validateTelemetryMetric, type Money, type TelemetryMetric } from '@cafeteria/contracts';

describe('API workspace contracts', () => {
  it('imports both a type and a runtime export through the public package', () => {
    const money: Money = { amountMinor: 125, currency: 'USD' };
    const timestamp = '2026-11-17T00:00:00Z';
    const metric: TelemetryMetric = {
      name: 'test.metric',
      value: money.amountMinor,
      unit: 'minor',
      source: 'ci',
      freshnessSeconds: 0,
      periodStart: timestamp,
      periodEnd: timestamp,
      collectedAt: timestamp,
      subject: { type: 'team' },
    };
    expect(validateTelemetryMetric(metric)).toEqual([]);
  });
});
