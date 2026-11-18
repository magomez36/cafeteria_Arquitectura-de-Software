import http from 'k6/http';
import { check, sleep } from 'k6';
import { stagingOrigin } from './staging-origin.mjs';

const webBase = stagingOrigin(__ENV.STAGING_BASE_URL, 'STAGING_BASE_URL');
const apiBase = stagingOrigin(__ENV.STAGING_API_URL, 'STAGING_API_URL');

export const options = {
  scenarios: { staging_smoke_load: { executor: 'constant-vus', vus: 5, duration: '2m' } },
  maxRedirects: 0,
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate==1'],
  },
};

export default function () {
  const web = http.get(webBase, { tags: { target: 'web' }, timeout: '5s' });
  check(web, { 'staging web is HTTP 200': (response) => response.status === 200 });
  const health = http.get(`${apiBase}/health`, { tags: { target: 'api' }, timeout: '5s' });
  check(health, {
    'staging API health is HTTP 200': (response) => response.status === 200,
    'staging API reports healthy': (response) => {
      try {
        return response.json('status') === 'ok';
      } catch {
        return false;
      }
    },
  });
  sleep(1);
}
