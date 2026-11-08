import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeHome, normalizeLH, lhRows, collect } from '../src/core/collectors.js';
import { Store } from '../src/core/store.js';
const row = {
  HOUSE_MANAGE_NO: '100',
  PBLANC_NO: '200',
  HOUSE_NM: '공식 공고 테스트',
  SUBSCRPT_AREA_CODE_NM: '서울',
  RCRIT_PBLANC_DE: '2026-11-01',
  RCEPT_BGNDE: '2026-11-09',
  RCEPT_ENDDE: '2026-11-11',
  TOT_SUPLY_HSHLDCO: 100,
  PBLANC_URL: 'https://www.applyhome.co.kr/test',
};
test('실제 공고의 미제공 가격·규칙을 생성하지 않는다', () => {
  const n = normalizeHome(row, 'apt', 'sale', 'APT');
  assert.equal(n.priceWon, null);
  assert.equal(n.rulesComplete, false);
  assert.equal(n.isDemo, false);
  assert.equal(n.starts, '2026-11-09');
});
test('청약홈 필수 식별자 누락과 위험 URL 처리', () => {
  assert.throws(() => normalizeHome({ ...row, PBLANC_NO: null }, 'apt', 'sale', 'APT'));
  assert.equal(
    normalizeHome({ ...row, PBLANC_URL: 'javascript:alert(1)' }, 'apt', 'sale', 'APT').sourceUrl,
    null,
  );
});
test('LH 공고게시 종료일을 접수 마감일로 매핑하지 않는다', () => {
  const n = normalizeLH({
    PAN_NM: 'LH 테스트',
    DTL_URL: 'https://apply.lh.or.kr/?q=PAN_ID:123',
    CNP_CD_NM: '경기도',
    CLSG_DT: '2026.11.30',
    UPP_AIS_TP_CD: '06',
  });
  assert.equal(n.deadline, null);
  assert.equal(n.publicationEnd, '2026-11-30');
  assert.equal(n.externalId, '123');
  assert.equal(n.region, '경기');
});
test('LH 고유번호·응답 형식이 잘못되면 실패로 남긴다', () => {
  assert.throws(() => normalizeLH({ PAN_NM: '공고', DTL_URL: 'https://apply.lh.or.kr/' }));
  assert.throws(() => lhRows([{ dsSch: [{ SS_CODE: 'N' }], dsList: [] }]));
  assert.throws(() => lhRows({ error: 'denied' }));
  assert.deepEqual(lhRows([{ dsSch: [{ SS_CODE: 'Y' }], dsList: [] }]), []);
});
test('인증키가 없을 때 외부 요청을 하지 않는다', async () => {
  const s = new Store(':memory:', { seed: false });
  try {
    const results = await collect(s, {
      env: {},
      fetchFn: () => {
        throw new Error('호출하면 안 됨');
      },
    });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.status === 'unconfigured'));
    assert.equal(s.runs().length, 0);
  } finally {
    s.close();
  }
});
test('수집·원본 저장·재수집 중복 방지·키 비노출', async () => {
  const s = new Store(':memory:', { seed: false }),
    dir = mkdtempSync(join(tmpdir(), 'moa-raw-'));
  try {
    let calls = 0;
    const options = {
      today: '2026-11-08',
      env: { APPLYHOME_SERVICE_KEY: 'test-secret' },
      rawDir: dir,
      fetchFn: async (url) => {
        calls++;
        assert.equal(url.searchParams.get('serviceKey'), 'test-secret');
        return { ok: true, json: async () => ({ data: [row], matchCount: 1 }) };
      },
    };
    const r = await collect(s, options);
    assert.equal(r[0].status, 'success');
    assert.equal(calls, 3);
    await collect(s, options);
    assert.equal(s.all().length, 3);
    assert.ok(s.all().every((n) => s.versions(n.id).length === 1));
    for (const file of readdirSync(join(dir, 'applyhome', '1')))
      assert.ok(!readFileSync(join(dir, 'applyhome', '1', file), 'utf8').includes('test-secret'));
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('외부 인증 실패 시 기존 데이터와 인증키를 보호한다', async () => {
  const s = new Store(':memory:');
  try {
    const count = s.all().length;
    const results = await collect(s, {
      env: { APPLYHOME_SERVICE_KEY: 'private-key' },
      fetchFn: async () => ({ ok: false, status: 403 }),
    });
    assert.equal(results[0].status, 'failed');
    assert.equal(s.all().length, count);
    assert.ok(!JSON.stringify(s.runs()).includes('private-key'));
  } finally {
    s.close();
  }
});

test('신규 마감 공고는 저장하지 않고 기존 공고의 마감 정정은 보존한다', async () => {
  const s = new Store(':memory:', { seed: false });
  const dir = mkdtempSync(join(tmpdir(), 'moa-active-'));
  try {
    const existing = normalizeHome(row, 'getAPTLttotPblancDetail', 'sale', 'APT');
    s.upsert(existing);
    s.favorite(existing.id, true);
    const result = await collect(s, {
      today: '2026-11-08',
      env: { APPLYHOME_SERVICE_KEY: 'fake-key' },
      rawDir: dir,
      fetchFn: async () => ({
        ok: true,
        json: async () => ({
          data: [{ ...row, RCEPT_BGNDE: '2026-11-01', RCEPT_ENDDE: '2026-11-07' }],
          matchCount: 1,
        }),
      }),
    });
    assert.equal(result[0].count, 0);
    assert.equal(s.all().length, 1);
    assert.equal(s.get(existing.id).deadline, '2026-11-07');
    assert.equal(s.get(existing.id).favorite, true);
    assert.equal(s.versions(existing.id).length, 2);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('LH 유형별 목록을 수집하되 접수 일정은 추정하지 않는다', async () => {
  const s = new Store(':memory:', { seed: false }),
    dir = mkdtempSync(join(tmpdir(), 'moa-lh-'));
  try {
    const r = await collect(s, {
      env: { LH_SERVICE_KEY: 'mock-key' },
      rawDir: dir,
      fetchFn: async (url) => ({
        ok: true,
        json: async () => [
          {
            dsSch: [{ SS_CODE: 'Y' }],
            dsList: [
              {
                PAN_NM: '가상 API 응답',
                PAN_ID: 'ID-' + url.searchParams.get('UPP_AIS_TP_CD'),
                DTL_URL: 'https://apply.lh.or.kr/test',
                CNP_CD_NM: '서울',
                CLSG_DT: '2026.12.31',
              },
            ],
          },
        ],
      }),
    });
    assert.equal(r[1].status, 'success');
    assert.equal(s.all().length, 4);
    assert.ok(s.all().every((n) => n.deadline === null && n.priceWon === null));
    assert.equal(s.all().find((n) => n.externalId === 'ID-06').type, 'rental');
    assert.equal(s.all().find((n) => n.externalId === 'ID-05').type, 'sale');
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
