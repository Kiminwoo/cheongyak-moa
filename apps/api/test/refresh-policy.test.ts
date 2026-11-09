import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/core/store.js';
import { COVERAGE_UNITS } from '../src/core/coverage.js';
import { refreshPolicy } from '../src/core/refresh-policy.js';
import { exportPublicSnapshot } from '../src/core/snapshot-export.js';
import { decodeSnapshot } from '../src/core/public-snapshot.js';
import { demoNotices } from '../src/core/demo.js';

test('갱신은 이번 실행의 모든 API 성공을 요구하고 과거 성공·미설정·실패를 허용하지 않는다', (t) => {
  const store = new Store(':memory:', { seed: false });
  t.after(() => store.close());
  const start = new Date(Date.now() - 1000).toISOString();
  assert.equal(refreshPolicy(store.coverage(), start, 0).blocked.length, 12);
  for (const spec of COVERAGE_UNITS.filter((unit) => unit.channel === 'api')) {
    store.beginUnit(spec);
    store.finishUnit(spec.sourceId, spec.unit, 'success', 0, 0);
  }
  const coverage = store.coverage();
  assert.equal(refreshPolicy(coverage, start, 0).snapshotAllowed, true);
  assert.equal(refreshPolicy(coverage, start, 0).nationwideComplete, false);
  assert.equal(refreshPolicy(coverage, start, 0).limited.length, 3);
  assert.equal(
    refreshPolicy(coverage, new Date(Date.now() + 1000).toISOString(), 0).snapshotAllowed,
    false,
  );
  assert.equal(refreshPolicy(coverage, start, 1).snapshotAllowed, false);
  for (const status of ['not-run', 'running', 'failed'] as const) {
    const bad = structuredClone(coverage);
    bad[0].status = status;
    assert.equal(refreshPolicy(bad, start, 0).snapshotAllowed, false);
  }
});

test('공개 사본은 검증 실패 시 기존 파일을 유지하고 성공 시 개인 정보를 제외한다', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'refresh-export-'));
  const store = new Store(':memory:', { seed: false });
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const folder = join(root, 'apps/api/snapshots');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, 'public-notices.snapshot.json');
  writeFileSync(target, 'previous');
  assert.throws(() => exportPublicSnapshot(store.db, root, {}));
  assert.equal(readFileSync(target, 'utf8'), 'previous');
  const notice = { ...demoNotices()[0], isDemo: false, starts: null, deadline: null };
  store.upsert(notice);
  store.saveProfile({ birthDate: '1991-02-03' });
  store.favorite(notice.id, true);
  assert.throws(() => exportPublicSnapshot(store.db, root, { SERVICE_KEY: notice.title }));
  assert.equal(readFileSync(target, 'utf8'), 'previous');
  exportPublicSnapshot(store.db, root, {});
  const snapshot = decodeSnapshot(readFileSync(target, 'utf8'));
  assert.deepEqual(snapshot.profile, {});
  assert.equal(snapshot.notices[0].favorite, false);
  assert.deepEqual(snapshot.runs, []);
});
