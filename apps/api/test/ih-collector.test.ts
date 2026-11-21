import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectIH } from '../src/core/ih-collector.js';
import { Store } from '../src/core/store.js';

const listing = {
  sj: '인천 검단 공공임대주택 입주자 모집공고',
  tyNm: '주택임대',
  seNm: '임대',
  crtYmd: '2026-11-01',
  link: '/main/bbs/bbsMsgDetail.do?msg_seq=11&bcd=notice',
};
const fixture = (t) => {
  const store = new Store(':memory:', { seed: false });
  const rawDir = mkdtempSync(join(tmpdir(), 'moa-ih-'));
  t.after(() => {
    store.close();
    rmSync(rawDir, { recursive: true, force: true });
  });
  return { store, options: { env: { IH_SERVICE_KEY: 'test-key' }, rawDir, today: '2026-11-21' } };
};
const page = (pageNo, posts, totalCount = posts.length) => ({
  ok: true,
  json: async () => ({
    response: {
      header: { resultCode: '00' },
      body: { pageNo, numOfRows: 10, totalCount, posts },
    },
  }),
});

test('인천도시공사 공고를 원문 이름과 링크로 저장하고 게시일을 접수일로 쓰지 않는다', async (t) => {
  const { store, options } = fixture(t);
  const [result] = await collectIH(store, {
    ...options,
    fetchFn: async (url) => {
      assert.equal(url.pathname, '/B552831/ih/slls-posts');
      assert.equal(url.searchParams.get('startCrtrYmd'), '2026-05-25');
      assert.equal(url.searchParams.get('endCrtrYmd'), '2026-11-21');
      assert.equal(url.searchParams.get('serviceKey'), 'test-key');
      return page(1, [listing, { ...listing, sj: '상가 임대 공급공고' }]);
    },
  });
  assert.equal(result.status, 'success');
  assert.equal(result.count, 1);
  const [notice] = store.all();
  assert.equal(notice.title, listing.sj);
  assert.equal(notice.subtype, listing.tyNm);
  assert.equal(notice.sourceUrl, 'https://www.ih.co.kr' + listing.link);
  assert.equal(notice.publicationDate, '2026-11-01');
  assert.deepEqual(
    [notice.announced, notice.starts, notice.deadline, notice.depositWon],
    [null, null, null, null],
  );
  assert.equal(store.coverage().find((item) => item.unit === 'ih-api').fetchedCount, 2);
});

test('인천도시공사 중간 페이지 오류 시 이전 공고를 보존하고 일부만 저장하지 않는다', async (t) => {
  const { store, options } = fixture(t);
  await collectIH(store, { ...options, fetchFn: async () => page(1, [listing]) });
  const old = store.all();
  const [result] = await collectIH(store, {
    ...options,
    fetchFn: async (url) =>
      url.searchParams.get('pageNo') === '1'
        ? page(
            1,
            Array.from({ length: 10 }, (_, index) => ({
              ...listing,
              link: '/main/bbs/bbsMsgDetail.do?msg_seq=' + (20 + index),
            })),
            11,
          )
        : page(2, [], 11),
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(store.all(), old);
  const [empty] = await collectIH(store, { ...options, fetchFn: async () => page(1, []) });
  assert.equal(empty.status, 'success');
  assert.equal(store.get(old[0].id).withdrawnFromProvider, true);
});
