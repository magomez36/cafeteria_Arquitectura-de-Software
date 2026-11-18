const productionHostLabel = /(^|[.-])(prod|production)([.-]|$)/i;
const stagingHostLabel = /(^|[.-])staging([.-]|$)/i;
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

// Shared by Node and k6 so validation also runs when k6 is started directly.
export function stagingOrigin(value, name) {
  if (typeof value !== 'string' || !value.startsWith('https://')) {
    throw new Error(`${name} must use an absolute HTTPS origin.`);
  }
  const host = value.slice('https://'.length).replace(/\/$/, '').toLowerCase();
  if (
    host.length > 253 ||
    /[^a-z0-9.-]/i.test(host) ||
    !host.includes('.') ||
    host.split('.').some((label) => !dnsLabel.test(label))
  ) {
    throw new Error(
      `${name} must be a DNS origin without credentials, port, path, query or fragment.`,
    );
  }
  if (productionHostLabel.test(host)) {
    throw new Error(`${name} must not target a production-like hostname.`);
  }
  if (!stagingHostLabel.test(host)) {
    throw new Error(`${name} must include a staging hostname label.`);
  }
  return `https://${host}`;
}
