import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

export function materializeBlueprint(template, repository, values) {
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GHCR repository.');
  const classifiers = {
    RENDER_REGION: /^[a-z][a-z0-9-]+$/,
    RENDER_API_PLAN: /^(?!free$)[a-z][a-z0-9-]+$/,
    RENDER_WORKER_PLAN: /^(?!free$)[a-z][a-z0-9-]+$/,
    RENDER_CACHE_PLAN: /^[a-z][a-z0-9-]+$/,
    RENDER_POSTGRES_PLAN: /^[a-z][a-z0-9-]+$/,
    RENDER_GHCR_CREDENTIAL: /^[\w .-]+$/,
  };
  for (const [key, pattern] of Object.entries(classifiers)) {
    if (
      typeof values[key] !== 'string' ||
      values[key] !== values[key].trim() ||
      !pattern.test(values[key])
    ) {
      throw new Error(`${key} must be supplied with the approved Render setting.`);
    }
  }
  for (const component of ['api', 'worker']) {
    const key = `${component.toUpperCase()}_IMAGE_DIGEST`;
    const prefix = `ghcr.io/${repository}/${component}@sha256:`;
    const ref = values[key];
    if (
      typeof ref !== 'string' ||
      !ref.startsWith(prefix) ||
      ref.length !== prefix.length + 64 ||
      !/^[a-f0-9]{64}$/.test(ref.slice(prefix.length))
    ) {
      throw new Error(`${key} must be an immutable digest in the approved registry.`);
    }
  }

  const resolve = (node) => {
    if (Array.isArray(node)) return node.map(resolve);
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, resolve(value)]));
    }
    if (typeof node !== 'string') return node;
    const placeholder = /^__([A-Z_]+)__$/.exec(node);
    if (!placeholder) return node;
    if (!Object.hasOwn(values, placeholder[1]) || !values[placeholder[1]]) {
      throw new Error(`Missing template value: ${placeholder[1]}.`);
    }
    return values[placeholder[1]];
  };
  return stringify(resolve(parse(template)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const template = await readFile(new URL('../../render.yaml', import.meta.url), 'utf8');
  const repository = process.env.GITHUB_REPOSITORY?.toLowerCase() ?? '';
  process.stdout.write(materializeBlueprint(template, repository, process.env));
}
