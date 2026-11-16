import http from 'k6/http';
import { check, sleep } from 'k6';

const webBase = __ENV.STAGING_BASE_URL;
const apiBase = __ENV.STAGING_API_URL;

if (!webBase || !apiBase)
  throw new Error('Set STAGING_BASE_URL and STAGING_API_URL to approved staging URLs.');
for (const value of [webBase, apiBase]) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || /(^|[.-])(prod|production)([.-]|$)/i.test(url.hostname)) {
    throw new Error('Load tests require HTTPS staging hosts and refuse production-like hostnames.');
  }
}

export const options = {
  scenarios: { staging_smoke_load: { executor: 'constant-vus', vus: 5, duration: '2m' } },
  thresholds: { http_req_duration: ['p(95)<300'], http_req_failed: ['rate<0.01'] },
};

export default function () {
  const web = http.get(webBase, { tags: { target: 'web' } });
  check(web, { 'staging web is HTTP 200': (response) => response.status === 200 });
  const health = http.get(`${apiBase.replace(/\/$/, '')}/health`, { tags: { target: 'api' } });
  check(health, {
    'staging API health is HTTP 200': (response) => response.status === 200,
    'staging API reports healthy': (response) => response.json('status') === 'ok',
  });
  sleep(1);
}
