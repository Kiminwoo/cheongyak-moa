import test from 'node:test';
import assert from 'node:assert/strict';
import type { FetchJSON } from '@cheongyak-moa/contracts';
import { collectAptResults } from '../src/core/applyhome-results.js';
import { normalizeHome } from '../src/core/normalization.js';
import { Store } from '../src/core/store.js';
import { previewData } from '../src/preview.js';
import { decodeSnapshot, encodeSnapshot } from '../src/core/public-snapshot.js';

test('청약 결과는 마감 APT에 묶여 공개 사본에 포함되고 불일치 응답은 기존 결과를 변경하지 않는다', async (t) => {
  const store = new Store(':memory:', { seed: false });
  t.after(() => store.close());
  const today = '2026-11-21';
  const row = {
    HOUSE_MANAGE_NO: '100',
    PBLANC_NO: '200',
    HOUSE_NM: '테스트 APT',
    RCRIT_PBLANC_DE: '2026-11-01',
    RCEPT_BGNDE: '2026-11-02',
    RCEPT_ENDDE: '2026-11-03',
    PRZWNER_PRESNATN_DE: '2026-11-10',
  };
  const archived = normalizeHome(row, 'getAPTLttotPblancDetail', 'sale', 'APT')!;
  store.upsert(archived);
  store.favorite(archived.id, true);
  store.upsert({ ...archived, id: 'open', deadline: '2026-11-30', winnerDate: '2026-12-05' });
  const calls: URL[] = [];
  let mismatch = false;
  const fetchFn: FetchJSON = async (input) => {
    const url = new URL(input);
    calls.push(url);
    const isSpecial = url.pathname.endsWith('getAPTSpsplyReqstStus');
    return Response.json({
      matchCount: 1,
      currentCount: 1,
      data: [
        {
          ...row,
          PBLANC_NO: mismatch && isSpecial ? '999' : '200',
          MODEL_NO: '01',
          HOUSE_TY: '084.9A',
          RESIDE_SECD: '01',
          RESIDE_SENM: '해당지역',
          SUBSCRPT_RANK_CODE: 1,
          SUPLY_HSHLDCO: 10,
          REQ_CNT: mismatch ? 200 : 100,
          CMPET_RATE: mismatch ? '20.00' : '10.00',
          LWET_SCORE: 45,
          TOP_SCORE: 65,
          AVRG_SCORE: '55.50',
          MNYCH_HSHLDCO: 5,
          CRSPAREA_MNYCH_CNT: 0,
        },
      ],
    });
  };
  const options = { today, env: { APPLYHOME_RESULTS_SERVICE_KEY: 'fake-key' }, fetchFn };
  assert.equal((await collectAptResults(store, options)).updated, 1);
  assert.equal(calls.length, 3);
  for (const url of calls) {
    assert.equal(url.searchParams.get('cond[HOUSE_MANAGE_NO::EQ]'), '100');
    assert.equal(url.searchParams.get('cond[PBLANC_NO::EQ]'), '200');
  }
  const snapshot = { ...previewData(store.db, today), snapshotAt: today + 'T00:00:00Z' };
  const publicData = decodeSnapshot(encodeSnapshot(snapshot));
  assert.deepEqual(
    publicData.notices.map((n) => n.id),
    ['open'],
  );
  const result = publicData.pastResults?.[0];
  assert.equal(result?.id, archived.id);
  assert.equal(result.favorite, false);
  assert.equal(result.aptResults?.competition[0].rate, '10.00');
  assert.equal(result.aptResults?.scores[0].average, '55.50');
  assert.equal(result.aptResults?.special[0].local, '0');
  mismatch = true;
  assert.equal((await collectAptResults(store, options)).failed, 1);
  assert.deepEqual(store.get(archived.id)?.aptResults, result.aptResults);
});
