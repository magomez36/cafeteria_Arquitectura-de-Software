export type TelemetrySubject =
  | { readonly type: 'team' }
  | {
      readonly type: 'person';
      readonly subjectId: string;
      readonly accessAuthorized: true;
      readonly noticeGiven: true;
    };

export interface TelemetryMetric {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly source: 'github' | 'ci' | 'sonarqube' | 'deployment';
  readonly freshnessSeconds: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly collectedAt: string;
  readonly subject: TelemetrySubject;
}

export function validateTelemetryMetric(metric: TelemetryMetric): string[] {
  const errors: string[] = [];
  if (!metric.name.trim()) errors.push('name is required');
  if (!Number.isFinite(metric.value)) errors.push('value must be finite');
  if (!metric.unit.trim()) errors.push('unit is required');
  if (!['github', 'ci', 'sonarqube', 'deployment'].includes(metric.source))
    errors.push('source is invalid');
  if (!Number.isInteger(metric.freshnessSeconds) || metric.freshnessSeconds < 0)
    errors.push('freshnessSeconds must be a non-negative integer');

  const timestamps = [metric.periodStart, metric.periodEnd, metric.collectedAt].map(Date.parse);
  if (timestamps.some(Number.isNaN)) errors.push('period and collectedAt must be valid timestamps');
  else if (timestamps[1]! < timestamps[0]!) errors.push('periodEnd must not precede periodStart');

  if (
    metric.subject.type === 'person' &&
    (!metric.subject.subjectId.trim() ||
      !metric.subject.accessAuthorized ||
      !metric.subject.noticeGiven)
  ) {
    errors.push('individual telemetry requires an identified, authorized subject and prior notice');
  }
  if (
    metric.subject.type === 'person' &&
    /rank|quality.*commit|commit.*quality/i.test(metric.name)
  ) {
    errors.push('individual ranking and commit-count-based quality inference are prohibited');
  }
  return errors;
}
