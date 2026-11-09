import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { myhomePage, normalizeMyhome, issuerGroup } from '../src/core/myhome.js';
import { collectLocal } from '../src/core/local-collectors.js';
import { Store } from '../src/core/store.js';
import { isActiveNotice, stage } from '@cheongyak-moa/domain';

const row = {
  pblancId: '100',
  pblancNm: '테스트 공공임대 모집',
  suplyInsttNm: '서울주택도시개발공사',
  brtcNm: '서울특별시',
  signguNm: '강남구',
  fullAdres: '서울특별시 강남구 테스트 주소',
  rcritPblancDe: '20261101',
  beginDe: '20261108',
  endDe: '20261120',
  suplyTyNm: '행복주택',
  url: 'https://www.i-sh.co.kr/test',
  sttusNm: '접수중',
};
const payload = (rows, total = rows.length) => ({
  response: { header: { resultCode: '00' }, body: { totalCount: total, items: { item: rows } } },
});
function setup(t) {
  const store = new Store(':memory:', { seed: false });
  const rawDir = mkdtempSync(join(tmpdir(), 'moa-myhome-'));
  t.after(() => {
    store.close();
    rmSync(rawDir, { recursive: true, force: true });
  });
  return { store, rawDir };
}

test('기관명으로 SH·GH·지방공사를 분류하고 LH·민간을 임의 분류하지 않는다', () => {
  for (const name of ['서울주택도시공사', '서울주택도시개발공사', 'SH'])
    assert.equal(issuerGroup(name), 'sh');
  assert.equal(issuerGroup('경기주택도시공사'), 'gh');
  assert.equal(issuerGroup('인천도시공사'), 'local');
  assert.equal(issuerGroup('한국토지주택공사'), 'lh');
  assert.equal(issuerGroup('민간 건설업체'), null);
  assert.throws(() => normalizeMyhome([{ ...row, suplyInsttNm: '' }]));
});

test('단일·배열·빈 응답과 오류 코드를 구분한다', () => {
  assert.equal(myhomePage(payload([row])).rows.length, 1);
  assert.equal(
    myhomePage({ header: { resultCode: '00' }, body: { totalCount: '1', item: row } }).rows.length,
    1,
  );
  assert.equal(myhomePage({ header: { resultCode: '03' } }).total, 0);
  assert.throws(() => myhomePage({ header: { resultCode: '30' } }));
  assert.throws(() => myhomePage(payload([], 1)));
  assert.throws(() => myhomePage({ data: [] }));
});

test('공고별 단지를 합치고 서로 다른 기간·전국 지역·안전한 원문을 보존한다', () => {
  const result = normalizeMyhome([
    row,
    {
      ...row,
      houseSn: 2,
      brtcNm: '경기도',
      fullAdres: '경기도 테스트 주소',
      beginDe: '20261115',
      endDe: '20261125',
    },
  ]);
  assert.equal(result.notices.length, 1);
  const notice = result.notices[0];
  assert.equal(notice.region, '전국');
  assert.equal(notice.starts, null);
  assert.equal(stage(notice, '2026-11-08'), 'unknown');
  assert.equal(stage(notice, '2026-11-26'), 'closed');
  assert.equal(notice.schedules.length, 2);
  assert.equal(notice.depositWon, null);
  assert.equal(notice.issuerName, row.suplyInsttNm);
  const unsafe = normalizeMyhome([
    { ...row, url: 'https://evil.example/', pcUrl: 'javascript:alert(1)' },
  ]).notices[0];
  assert.ok(unsafe.sourceUrl.startsWith('https://www.myhome.go.kr/'));
  assert.throws(() => normalizeMyhome([{ ...row, endDe: '20260230' }]));
});

test('마감·취소·현재 목록에서 사라진 공고는 활성으로 노출하지 않는다', async (t) => {
  const { store, rawDir } = setup(t);
  const env = { MYHOME_SERVICE_KEY: 'fake-secret' };
  const options = { env, rawDir, today: '2026-11-08' };
  const results = await collectLocal(store, {
    ...options,
    fetchFn: async () => ({
      ok: true,
      json: async () =>
        payload([
          row,
          { ...row, pblancId: '101', suplyInsttNm: '경기주택도시공사' },
          { ...row, pblancId: '102', suplyInsttNm: '인천도시공사' },
          { ...row, pblancId: 'closed', sttusNm: '접수마감' },
        ]),
    }),
  });
  assert.deepEqual(
    results.map((result) => result.count),
    [1, 1, 1],
  );
  assert.equal(store.all().length, 3);
  const id = store.all()[0].id;
  store.favorite(id, true);
  await collectLocal(store, {
    ...options,
    fetchFn: async () => ({ ok: true, json: async () => payload([]) }),
  });
  assert.equal(store.all().filter((notice) => isActiveNotice(notice, options.today)).length, 0);
  assert.equal(store.get(id).favorite, true);
  assert.equal(store.all().length, 3);
  await collectLocal(store, {
    ...options,
    fetchFn: async () => ({ ok: true, json: async () => payload([row]) }),
  });
  assert.equal(store.all().filter((notice) => isActiveNotice(notice, options.today)).length, 1);
});

test('중간 페이지·인증 실패는 기존 기관 공고와 관심 상태를 그대로 유지하고 키를 노출하지 않는다', async (t) => {
  const { store, rawDir } = setup(t);
  store.upsert(normalizeMyhome([row]).notices[0]);
  const before = JSON.stringify(store.all());
  const options = { env: { LH_SERVICE_KEY: 'fake-secret' }, rawDir, today: '2026-11-08' };
  const result = await collectLocal(store, {
    ...options,
    fetchFn: async (url) => {
      assert.equal(url.searchParams.get('serviceKey'), 'fake-secret');
      return url.searchParams.get('pageNo') === '1'
        ? { ok: true, json: async () => payload([row], 2) }
        : { ok: false, status: 403, json: async () => ({}) };
    },
  });
  assert.ok(result.every((item) => item.status === 'failed'));
  assert.equal(result[0].code, 'authentication');
  assert.equal(JSON.stringify(store.all()), before);
  assert.ok(!JSON.stringify(store.runs()).includes('fake-secret'));
  for (const file of readdirSync(join(rawDir, 'myhome', '1')))
    assert.ok(!readFileSync(join(rawDir, 'myhome', '1', file), 'utf8').includes('fake-secret'));
});

test('동일 응답 재수집은 버전을 늘리지 않고 인증키가 없으면 호출하지 않는다', async (t) => {
  const { store, rawDir } = setup(t);
  const skipped = await collectLocal(store, {
    env: {},
    fetchFn: async () => {
      throw Error('호출되면 안 됨');
    },
  });
  assert.ok(skipped.every((item) => item.status === 'unconfigured'));
  const options = {
    env: { MYHOME_SERVICE_KEY: 'fake-secret' },
    rawDir,
    today: '2026-11-08',
    fetchFn: async () => ({ ok: true, json: async () => payload([row]) }),
  };
  await collectLocal(store, options);
  await collectLocal(store, options);
  assert.equal(store.versions(store.all()[0].id).length, 1);
});

test('마이홈 일부 기관만 재시도할 때 다른 기관의 공고·성공 이력을 철회하지 않는다', async (t) => {
  const { store, rawDir } = setup(t);
  const gh = {
    ...row,
    pblancId: '200',
    suplyInsttNm: '경기주택도시공사',
    url: 'https://www.gh.or.kr/test',
  };
  const options = { env: { MYHOME_SERVICE_KEY: 'fake-secret' }, rawDir, today: '2026-11-09' };
  await collectLocal(store, {
    ...options,
    fetchFn: async () => ({ ok: true, json: async () => payload([row, gh]) }),
  });
  const old = store.all().find((n) => n.sourceId === 'gh');
  store.finishUnit('sh', 'myhome-rental', 'failed', 0, 0, 'authentication');
  const results = await collectLocal(store, {
    ...options,
    onlyFailed: true,
    fetchFn: async () => ({ ok: true, json: async () => payload([row]) }),
  });
  assert.deepEqual(
    results.map((result) => result.source),
    ['sh'],
  );
  assert.equal(store.get(old.id).withdrawnFromProvider, undefined);
  assert.equal(store.get(old.id).version, old.version);
  assert.equal(
    store.coverage().find((unit) => unit.sourceId === 'gh' && unit.unit === 'myhome-rental').status,
    'success',
  );
});
