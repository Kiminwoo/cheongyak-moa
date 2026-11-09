import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/core/store.js';
import { collect } from '../src/core/collectors.js';
import { HOME_OPERATIONS, normalizeHome } from '../src/core/normalization.js';
import { normalizePrices } from '../src/core/prices.js';
import { preparePayload } from '../src/core/ingestion.js';

const row = {
  HOUSE_MANAGE_NO: '100',
  PBLANC_NO: '200',
  HOUSE_NM: '명세 기반 공고 테스트',
  RCRIT_PBLANC_DE: '2026-11-01',
  SUBSCRPT_RCEPT_BGNDE: '2026-11-09',
  SUBSCRPT_RCEPT_ENDDE: '2026-11-11',
  SUBSCRPT_AREA_CODE_NM: '서울',
  PBLANC_URL: 'https://www.applyhome.co.kr/test',
};

function fixture(t) {
  const store = new Store(':memory:', { seed: false });
  const rawDir = mkdtempSync(join(tmpdir(), 'moa-coverage-'));
  t.after(() => {
    store.close();
    rmSync(rawDir, { recursive: true, force: true });
  });
  return {
    store,
    options: { rawDir, env: { APPLYHOME_SERVICE_KEY: 'test-private-key' }, today: '2026-11-09' },
  };
}
test('공공지원 민간임대·임의공급 목록과 임의공급 최고금액을 공식 필드로 정규화한다', () => {
  assert.equal(HOME_OPERATIONS.length, 5);
  const rental = preparePayload('applyhome-public-rental', {
    data: [{ ...row, HOUSE_DETAIL_SECD_NM: '공공지원민간임대' }],
  }).notices[0];
  assert.equal(rental.type, 'rental');
  assert.equal(rental.subtype, '공공지원민간임대');
  assert.equal(rental.starts, '2026-11-09');
  assert.equal(rental.deadline, '2026-11-11');
  assert.equal(rental.depositWon, null);
  const optional = preparePayload('applyhome-optional', { data: [row] }).notices[0];
  assert.equal(optional.type, 'sale');
  assert.equal(optional.operation, 'getOPTLttotPblancDetail');
  const prices = normalizePrices(optional, [
    {
      HOUSE_MANAGE_NO: '100',
      PBLANC_NO: '200',
      MODEL_NO: '01',
      HOUSE_TY: '059',
      LTTOT_TOP_AMOUNT: '77,500',
      SUPLY_HSHLDCO: 1,
    },
  ]);
  assert.equal(prices[0].maximumWon, 775000000);
});
test('일부 API 실패 시 다른 유형은 반영하고 실패 유형의 공고·관심·최근 성공 이력을 유지한다', async (t) => {
  const { store, options } = fixture(t);
  const ok = async () => ({ ok: true, json: async () => ({ data: [row], matchCount: 1 }) });
  await collect(store, { ...options, fetchFn: ok });
  const old = store.all().find((n) => n.operation === 'getPblPvtRentLttotPblancDetail');
  store.favorite(old.id, true);
  const previous = store.coverage().find((unit) => unit.unit === old.operation);
  const result = await collect(store, {
    ...options,
    fetchFn: async (url) =>
      url.pathname.endsWith(old.operation)
        ? { ok: false, status: 403, json: async () => ({}) }
        : {
            ok: true,
            json: async () => ({ data: [{ ...row, HOUSE_NM: '정정 공고 테스트' }], matchCount: 1 }),
          },
  });
  assert.equal(result[0].code, 'partial_failure');
  assert.equal(result[0].count, 4);
  assert.equal(store.get(old.id).title, old.title);
  assert.equal(store.get(old.id).favorite, true);
  assert.equal(store.get(old.id).version, old.version);
  const failed = store.coverage().find((unit) => unit.unit === old.operation);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.lastSuccessAt, previous.lastSuccessAt);
  assert.equal(failed.from, '2026-05-13');
  assert.ok(!JSON.stringify(store.coverage()).includes('test-private-key'));
  const calls = [];
  const versions = store
    .all()
    .filter((n) => n.id !== old.id)
    .map((n) => [n.id, n.version]);
  await collect(store, {
    ...options,
    onlyFailed: true,
    fetchFn: async (url) => {
      calls.push(url.pathname);
      return ok();
    },
  });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith(old.operation));
  assert.equal(store.coverage().find((unit) => unit.unit === old.operation).status, 'success');
  assert.deepEqual(
    store
      .all()
      .filter((n) => n.id !== old.id)
      .map((n) => [n.id, n.version]),
    versions,
  );
});
test('중간 페이지 누락·건수 변경을 성공으로 표시하지 않고 해당 유형의 기존 데이터를 보존한다', async (t) => {
  const { store, options } = fixture(t);
  const apt = normalizeHome(row, 'getAPTLttotPblancDetail', 'sale', 'APT');
  store.upsert(apt);
  const result = await collect(store, {
    ...options,
    fetchFn: async (url) => ({
      ok: true,
      json: async () => {
        if (!url.pathname.endsWith(apt.operation)) return { data: [], matchCount: 0 };
        if (url.searchParams.get('page') === '1')
          return {
            data: Array.from({ length: 100 }, (_, i) => ({ ...row, PBLANC_NO: String(i + 1) })),
            matchCount: 101,
          };
        return { data: [], matchCount: 101 };
      },
    }),
  });
  assert.equal(result[0].status, 'failed');
  assert.equal(store.all().length, 1);
  assert.equal(store.get(apt.id).version, 1);
  assert.equal(store.coverage().find((unit) => unit.unit === apt.operation).status, 'failed');
});
test('구버전 수집 이력·키 설정만으로 새 유형을 검증 성공 처리하지 않는다', async (t) => {
  const { store, options } = fixture(t);
  store.upsert(normalizeHome(row, 'getAPTLttotPblancDetail', 'sale', 'APT'));
  const coverage = store.coverage();
  assert.equal(coverage.filter((unit) => unit.status === 'success').length, 0);
  assert.equal(coverage.find((unit) => unit.unit === 'agency-boards').status, 'planned');
  const results = await collect(store, {
    ...options,
    onlyFailed: true,
    fetchFn: async () => {
      throw Error('호출되면 안 됩니다');
    },
  });
  assert.deepEqual(results, []);
});

test('청약홈 전체 목록 모드는 공고일 필터를 생략하고 재시도도 같은 범위를 유지한다', async (t) => {
  const { store, options } = fixture(t);
  await collect(store, {
    ...options,
    allDates: true,
    fetchFn: async (url) => {
      assert.equal(url.searchParams.has('cond[RCRIT_PBLANC_DE::GTE]'), false);
      assert.equal(url.searchParams.has('cond[RCRIT_PBLANC_DE::LTE]'), false);
      return { ok: false, status: 403, json: async () => ({}) };
    },
  });
  const results = await collect(store, {
    ...options,
    onlyFailed: true,
    fetchFn: async (url) => {
      assert.equal(url.searchParams.has('cond[RCRIT_PBLANC_DE::GTE]'), false);
      return {
        ok: true,
        json: async () => ({ data: [{ ...row, RCRIT_PBLANC_DE: '2020-01-01' }], matchCount: 1 }),
      };
    },
  });
  assert.equal(results[0].count, 5);
  assert.ok(
    store
      .coverage()
      .filter((unit) => unit.sourceId === 'applyhome')
      .every((unit) => unit.from === null && unit.to === null && unit.status === 'success'),
  );
});

test('페이지 한도에 도달하면 불완전한 목록을 반영하지 않는다', async (t) => {
  const { store, options } = fixture(t);
  const result = await collect(store, {
    ...options,
    env: { ...options.env, COLLECT_MAX_PAGES: '1' },
    fetchFn: async () => ({
      ok: true,
      json: async () => ({
        data: Array.from({ length: 100 }, (_, i) => ({ ...row, PBLANC_NO: String(i + 1) })),
        matchCount: 101,
      }),
    }),
  });
  assert.equal(result[0].code, 'page_limit');
  assert.equal(store.all().length, 0);
});
