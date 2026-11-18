import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleBoundaryPlugin } from './module-boundaries.js';

const rule = moduleBoundaryPlugin.rules['no-cross-module-import'];

test('ignores files outside domain module folders and accepts public contracts', () => {
  const outside = rule.create({ filename: '/repo/apps/api/src/main.ts', report() {} });
  assert.deepEqual(outside, {});

  const reports = [];
  const visitors = rule.create({
    filename: '/repo/apps/api/src/modules/catalog/catalog.module.ts',
    report: (finding) => reports.push(finding),
  });
  visitors.ImportDeclaration({ source: { value: '@cafeteria/contracts' } });
  visitors.ImportDeclaration({ source: { value: './catalog.service' } });
  visitors.ImportDeclaration({ source: { value: 'node:path' } });
  assert.deepEqual(reports, []);
});

test('reports cross-domain imports through import and re-export declarations', () => {
  const reports = [];
  const visitors = rule.create({
    filename: '/repo/apps/api/src/modules/promotions/promotions.service.ts',
    report: (finding) => reports.push(finding),
  });
  visitors.ImportDeclaration({ source: { value: '../catalog/catalog.service' } });
  visitors.ExportNamedDeclaration({
    source: { value: '@cafeteria/api/modules/orders' },
  });
  visitors.ExportAllDeclaration({ source: { value: '../payments/payment.service' } });
  assert.equal(reports.length, 3);
  assert.ok(reports.every((finding) => finding.messageId === 'boundary'));
});
