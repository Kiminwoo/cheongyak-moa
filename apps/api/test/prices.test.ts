import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeHome } from '../src/core/normalization.js';
import { Store } from '../src/core/store.js';
import { collect } from '../src/core/collectors.js';
import { normalizePrices, applyPrices, collectPrices } from '../src/core/prices.js';

const row = {
  HOUSE_MANAGE_NO: '100',
  PBLANC_NO: '200',
  HOUSE_NM: '가격 테스트',
  RCRIT_PBLANC_DE: '2026-11-01',
};
const notice = normalizeHome(row, 'getAPTLttotPblancDetail', 'sale', 'APT');
const model = {
  HOUSE_MANAGE_NO: '100',
  PBLANC_NO: '200',
  MODEL_NO: '01',
  HOUSE_TY: '084.9A',
  SUPLY_AR: '112.34',
  SUPLY_HSHLDCO: 20,
  LTTOT_TOP_AMOUNT: '62,500',
};

test('주택형 최고금액을 만원에서 원으로 변환하고 실제 최저가격은 생성하지 않는다', () => {
  const models = normalizePrices(notice, [model]);
  assert.equal(models[0].maximumWon, 625000000);
  assert.equal(models[0].units, 20);
  const updated = applyPrices(notice, models);
  assert.equal(updated.priceWon, null);
  assert.equal(updated.pricing.basis, 'model-maximum');
  assert.ok(!updated.quality.some((issue) => issue.code === 'price_missing'));
  for (const amount of [null, '', '-', 0])
    assert.equal(
      normalizePrices(notice, [{ ...model, LTTOT_TOP_AMOUNT: amount }])[0].maximumWon,
      null,
    );
});

test('마감·취소 공고의 가격 API는 호출하지 않는다', async () => {
  const store = new Store(':memory:', { seed: false });
  try {
    store.upsert({ ...notice, deadline: '2026-11-07' });
    store.upsert({ ...notice, id: 'cancelled', cancelled: true });
    const result = await collectPrices(store, {
      env: { APPLYHOME_SERVICE_KEY: 'fake-key' },
      today: '2026-11-08',
      fetchFn: async () => {
        throw new Error('호출되면 안 됩니다');
      },
    });
    assert.equal(result.total, 0);
    assert.equal(result.failed, 0);
    assert.equal(store.all().length, 2);
  } finally {
    store.close();
  }
});

test('다른 공고의 금액·잘못된 금액·주택형 충돌은 거부한다', () => {
  for (const change of [
    { PBLANC_NO: 'other' },
    { HOUSE_MANAGE_NO: 'other' },
    { MODEL_NO: '' },
    { LTTOT_TOP_AMOUNT: -1 },
    { LTTOT_TOP_AMOUNT: '1,,200' },
    { LTTOT_TOP_AMOUNT: '협의' },
    { SUPLY_HSHLDCO: 1.2 },
  ])
    assert.throws(() => normalizePrices(notice, [{ ...model, ...change }]));
  assert.throws(() => normalizePrices(notice, [model, { ...model, LTTOT_TOP_AMOUNT: '70000' }]));
  assert.throws(() => normalizePrices({ ...notice, type: 'rental' }, [model]));
});

test('오피스텔 금액 필드는 청약신청금과 구분하고 임대 금액으로 해석하지 않는다', () => {
  const other = { ...notice, operation: 'getUrbtyOfctlLttotPblancDetail', type: 'officetel' };
  const result = normalizePrices(other, [
    {
      ...model,
      HOUSE_TY: null,
      GP: '1군',
      TP: 'A',
      SUPLY_AMOUNT: '50000',
      SUBSCRPT_REQST_AMOUNT: '300',
    },
  ]);
  assert.equal(result[0].maximumWon, 500000000);
  assert.equal(result[0].housingType, '1군 · A');
});

test('기존 공고에 가격을 보강하고 관심 공고·반복 버전·목록 재수집 가격을 보존한다', async () => {
  const store = new Store(':memory:', { seed: false });
  const dir = mkdtempSync(join(tmpdir(), 'moa-prices-'));
  try {
    store.upsert(notice);
    store.favorite(notice.id, true);
    const options = {
      env: { APPLYHOME_SERVICE_KEY: 'fake-key' },
      rawDir: dir,
      fetchFn: async (url) => {
        assert.equal(url.searchParams.get('cond[HOUSE_MANAGE_NO::EQ]'), '100');
        assert.equal(url.searchParams.get('cond[PBLANC_NO::EQ]'), '200');
        return { ok: true, json: async () => ({ data: [model], matchCount: 1 }) };
      },
    };
    assert.equal((await collectPrices(store, options)).updated, 1);
    assert.equal(store.get(notice.id).favorite, true);
    assert.equal(store.versions(notice.id).length, 2);
    await collectPrices(store, options);
    assert.equal(store.versions(notice.id).length, 2);
    await collect(store, {
      env: options.env,
      rawDir: dir,
      fetchFn: async () => ({ ok: true, json: async () => ({ data: [row], matchCount: 1 }) }),
    });
    assert.equal(store.get(notice.id).pricing.models[0].maximumWon, 625000000);
    assert.equal(store.get(notice.id).favorite, true);
    const before = JSON.stringify(store.get(notice.id));
    const failure = await collectPrices(store, {
      ...options,
      fetchFn: async () => ({ ok: false, status: 403 }),
    });
    assert.equal(failure.failed, 1);
    assert.equal(JSON.stringify(store.get(notice.id)), before);
    assert.ok(!JSON.stringify(store.runs()).includes('fake-key'));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('가격 다중 페이지의 마지막 실패나 빈 응답으로 기존 가격을 삭제하지 않는다', async () => {
  const store = new Store(':memory:', { seed: false });
  const dir = mkdtempSync(join(tmpdir(), 'moa-price-pages-'));
  try {
    store.upsert(applyPrices(notice, normalizePrices(notice, [model])));
    const old = JSON.stringify(store.all());
    const options = { env: { APPLYHOME_SERVICE_KEY: 'fake-key' }, rawDir: dir };
    const empty = await collectPrices(store, {
      ...options,
      fetchFn: async () => ({ ok: true, json: async () => ({ data: [] }) }),
    });
    assert.equal(empty.empty, 1);
    const response = await collectPrices(store, {
      ...options,
      fetchFn: async (url) => ({
        ok: true,
        json: async () =>
          url.searchParams.get('page') === '1'
            ? {
                data: Array.from({ length: 100 }, (_, i) => ({ ...model, MODEL_NO: String(i) })),
                matchCount: 101,
              }
            : { data: [{ ...model, PBLANC_NO: 'wrong' }] },
      }),
    });
    assert.equal(response.failed, 1);
    assert.equal(JSON.stringify(store.all()), old);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
