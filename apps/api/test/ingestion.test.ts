import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/core/store.js';
import { preparePayload, importResponse } from '../src/core/ingestion.js';
import { inspectNotice, assertNoSecrets } from '../src/core/data-quality.js';
import { collectionConfig } from '../src/core/config.js';
import { initializeEnv } from '../src/core/setup.js';
import { collect } from '../src/core/collectors.js';
const row = {
  HOUSE_MANAGE_NO: '123',
  PBLANC_NO: '456',
  HOUSE_NM: '테스트 전용 가상 응답',
  SUBSCRPT_AREA_CODE_NM: '서울',
  RCRIT_PBLANC_DE: '2026-11-01',
  SPSPLY_RCEPT_BGNDE: '2026-11-08',
  SPSPLY_RCEPT_ENDDE: '2026-11-08',
  GNRL_RCEPT_BGNDE: '2026-11-09',
  GNRL_RCEPT_ENDDE: '2026-11-10',
  PBLANC_URL: 'https://www.applyhome.co.kr/test',
};
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'moa-ingest-'));
  const store = new Store(':memory:', { seed: false });
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, store };
}
test('공급유형별 접수일과 전체 범위를 보존한다', () => {
  const { notices } = preparePayload('applyhome-apt', { data: [row] });
  assert.equal(notices[0].starts, '2026-11-08');
  assert.equal(notices[0].deadline, '2026-11-10');
  assert.equal(notices[0].schedules.length, 2);
});
test('파일 자료를 API 검증 완료로 표시하지 않는다', () => {
  const { notices } = preparePayload('applyhome-apt', { data: [row] });
  assert.equal(notices[0].provenance.method, 'file-import');
  assert.equal(notices[0].provenance.reviewStatus, 'unverified');
  assert.equal(notices[0].rulesComplete, false);
  assert.ok(notices[0].quality.some((q) => q.code === 'price_missing'));
});
test('잘못된 날짜·일정순서·문자자료형을 거부한다', () => {
  for (const change of [
    { RCRIT_PBLANC_DE: '2026-02-30' },
    { GNRL_RCEPT_ENDDE: '2026-10-01' },
    { HSSPLY_ADRES: { invalid: true } },
    { HOUSE_NM: { invalid: true } },
  ])
    assert.throws(() => preparePayload('applyhome-apt', { data: [{ ...row, ...change }] }));
});
test('API 에러 응답과 서로 다른 중복 공고를 거부한다', () => {
  assert.throws(() => preparePayload('applyhome-apt', { error: 'denied' }));
  assert.throws(() =>
    preparePayload('applyhome-apt', { data: [row, { ...row, HOUSE_NM: '다른내용' }] }),
  );
  assert.equal(preparePayload('applyhome-apt', { data: [row, row] }).notices.length, 1);
});
test('비밀정보·키가 붙은 URL은 저장 전에 거부한다', () => {
  for (const payload of [
    { serviceKey: 'secret' },
    { data: [{ nested: { access_token: 'secret' } }] },
    { data: [{ PBLANC_URL: 'https://example.test/?serviceKey=secret' }] },
  ])
    assert.throws(() => assertNoSecrets(payload));
});
test('공식기관 외 링크는 공고 원문으로 표시하지 않는다', () => {
  const { notices } = preparePayload('applyhome-apt', {
    data: [{ ...row, PBLANC_URL: 'https://applyhome.co.kr.evil.test/a' }],
  });
  assert.equal(notices[0].sourceUrl, null);
});
test('일괄 가져오기는 한 행 오류에도 기존 DB를 보존한다', (t) => {
  const { dir, store } = temp(t);
  assert.throws(() =>
    importResponse(store, {
      format: 'applyhome-apt',
      payload: { data: [row, { ...row, PBLANC_NO: '777', GNRL_RCEPT_ENDDE: '2025-01-01' }] },
      rawDir: dir,
    }),
  );
  assert.equal(store.all().length, 0);
  assert.equal(store.runs()[0].status, 'failed');
});
test('반복 가져오기는 중복 버전을 만들지 않고 정정만 새 버전으로 저장한다', (t) => {
  const { dir, store } = temp(t);
  const input = { format: 'applyhome-apt', payload: { data: [row] }, rawDir: dir };
  assert.equal(importResponse(store, input).changes, 1);
  assert.equal(importResponse(store, input).changes, 0);
  assert.equal(store.all()[0].version, 1);
  importResponse(store, { ...input, payload: { data: [{ ...row, HOUSE_NM: '정정 테스트' }] } });
  assert.equal(store.all()[0].version, 2);
  assert.equal(store.runs()[0].method, 'file-import');
  assert.ok(store.runs()[0].warnings > 0);
  assert.ok(existsSync(join(dir, 'applyhome', '1', 'import.json')));
});
test('저장 중 실패하면 배치 전체를 롤백한다', (t) => {
  const { store } = temp(t);
  const n = preparePayload('applyhome-apt', { data: [row] }).notices[0];
  assert.throws(() => store.upsertBatch([n, { ...n, id: 'broken', sourceId: null }]));
  assert.equal(store.all().length, 0);
});
test('수집 기간과 설정 진단은 키 값을 노출하지 않는다', () => {
  const config = collectionConfig(
    { APPLYHOME_SERVICE_KEY: 'not-for-output', LH_SERVICE_KEY: ' ', COLLECT_LOOKBACK_DAYS: '7' },
    '2026-11-08',
  );
  assert.equal(config.from, '2026-11-01');
  assert.equal(config.configured.lh, false);
  assert.ok(!JSON.stringify(config).includes('not-for-output'));
  for (const days of ['0', '-1', '1.5', 'abc', '3651'])
    assert.throws(() => collectionConfig({ COLLECT_LOOKBACK_DAYS: days }));
});
test('.env 생성은 기존 키를 덮어쓰지 않는다', (t) => {
  const { dir } = temp(t);
  writeFileSync(join(dir, '.env.example'), 'APPLYHOME_SERVICE_KEY=\n');
  assert.equal(initializeEnv(dir).created, true);
  writeFileSync(join(dir, '.env'), 'existing private value');
  assert.equal(initializeEnv(dir).created, false);
  assert.equal(readFileSync(join(dir, '.env'), 'utf8'), 'existing private value');
});
test('중간 API 실패 시 출처 전체의 기존 공고를 유지한다', async (t) => {
  const { dir, store } = temp(t);
  let calls = 0;
  const result = await collect(store, {
    env: { APPLYHOME_SERVICE_KEY: 'mock' },
    rawDir: dir,
    fetchFn: async () => {
      calls++;
      return calls === 1
        ? { ok: true, json: async () => ({ data: [row], matchCount: 1 }) }
        : { ok: false, status: 403 };
    },
  });
  assert.equal(result[0].status, 'failed');
  assert.equal(store.all().length, 0);
  assert.equal(result[0].code, 'authentication');
});
test('네트워크 차단과 키 오류를 구분하고 URL을 노출하지 않는다', async (t) => {
  const { dir, store } = temp(t);
  const result = await collect(store, {
    env: { APPLYHOME_SERVICE_KEY: 'mock' },
    rawDir: dir,
    fetchFn: async () => {
      throw Object.assign(new Error('https://host/?serviceKey=private'), {
        cause: { code: 'EACCES' },
      });
    },
  });
  assert.equal(result[0].code, 'network_denied');
  assert.equal(store.runs()[0].errorCode, 'network_denied');
  assert.ok(!JSON.stringify(store.runs()).includes('private'));
});
