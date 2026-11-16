export type DeploymentEnvironment = 'preview' | 'staging' | 'production';
export type DeploymentState = 'queued' | 'deploying' | 'healthy' | 'failed' | 'rolled_back';

export interface DeploymentArtifact {
  readonly kind: 'container-image' | 'vercel-prebuilt';
  readonly digest: string;
  readonly uri?: string;
}

export interface DeploymentRecord {
  readonly deploymentId: string;
  readonly environment: DeploymentEnvironment;
  readonly sha: string;
  readonly artifact: DeploymentArtifact;
  readonly state: DeploymentState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rollbackOf?: string;
}

export interface ProductionReleasePolicy {
  readonly environment: string;
  readonly requiredApprovals: number;
  readonly concurrencyGroup: string;
  readonly cancelInProgress: boolean;
  readonly serviceOrder: readonly string[];
  readonly previousDeploymentId?: string;
  readonly rollbackOf?: string;
}

const validEnvironments = new Set<DeploymentEnvironment>(['preview', 'staging', 'production']);
const validStates = new Set<DeploymentState>([
  'queued',
  'deploying',
  'healthy',
  'failed',
  'rolled_back',
]);
const shaPattern = /^[0-9a-f]{40}$/i;
const digestPattern = /^sha256:[0-9a-f]{64}$/i;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isValidTimestamp(value: string): boolean {
  return utcTimestampPattern.test(value) && !Number.isNaN(Date.parse(value));
}

export function validateDeploymentRecord(record: DeploymentRecord): string[] {
  const errors: string[] = [];

  if (record.deploymentId.trim().length === 0) errors.push('deploymentId is required');
  if (!validEnvironments.has(record.environment)) errors.push('deployment environment is invalid');
  if (!shaPattern.test(record.sha))
    errors.push('sha must be a 40-character hexadecimal commit SHA');
  if (!digestPattern.test(record.artifact.digest)) {
    errors.push('artifact digest must use the immutable sha256:<64 hexadecimal characters> form');
  }
  if (!validStates.has(record.state)) errors.push('deployment state is invalid');
  if (!isValidTimestamp(record.createdAt))
    errors.push('createdAt must be an ISO 8601 UTC timestamp');
  if (!isValidTimestamp(record.updatedAt))
    errors.push('updatedAt must be an ISO 8601 UTC timestamp');
  if (
    isValidTimestamp(record.createdAt) &&
    isValidTimestamp(record.updatedAt) &&
    Date.parse(record.updatedAt) < Date.parse(record.createdAt)
  ) {
    errors.push('updatedAt must not precede createdAt');
  }
  if (record.state === 'rolled_back' && !record.rollbackOf?.trim()) {
    errors.push('rollbackOf is required for rolled_back deployments');
  }

  return errors;
}

export function validateProductionReleasePolicy(policy: ProductionReleasePolicy): string[] {
  const errors: string[] = [];
  if (policy.environment !== 'production') errors.push('production environment is required');
  if (!Number.isInteger(policy.requiredApprovals) || policy.requiredApprovals < 1)
    errors.push('at least one human approval is required');
  if (!policy.concurrencyGroup.trim())
    errors.push('production release concurrency group is required');
  if (policy.cancelInProgress)
    errors.push('an in-progress production release must not be cancelled by a newer release');
  const apiIndex = policy.serviceOrder.indexOf('api');
  const workerIndex = policy.serviceOrder.indexOf('worker');
  const webIndex = policy.serviceOrder.indexOf('web');
  if (
    apiIndex < 0 ||
    workerIndex < 0 ||
    webIndex < 0 ||
    apiIndex >= webIndex ||
    workerIndex >= webIndex
  ) {
    errors.push('API and worker must be deployed before web');
  }
  if (policy.rollbackOf && policy.rollbackOf !== policy.previousDeploymentId) {
    errors.push('rollback must link to the retained previous deployment');
  }
  return errors;
}
