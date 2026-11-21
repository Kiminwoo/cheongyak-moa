import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { Store } from '../src/core/store.js';
import { request } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoNotices } from '../src/core/demo.js';
async function fixture(t, store = new Store(':memory:'), options = {}) {
  const { server } = createApp({ store, env: {}, ...options });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}
const headers = { 'Content-Type': 'application/json', 'X-Local-Request': '1' };
test('수집 범위 API는 미실행·미연동을 완료로 표시하지 않는다', async (t) => {
  const base = await fixture(t);
  const data = await (await fetch(base + '/api/coverage')).json();
  assert.equal(data.nationwideComplete, false);
  assert.equal(data.units.filter((unit) => unit.sourceId === 'applyhome').length, 5);
  assert.ok(data.units.some((unit) => unit.status === 'planned'));
  assert.ok(!data.units.some((unit) => unit.status === 'success'));
});
test('화면과 API가 동작하고 비밀정보를 반환하지 않는다', async (t) => {
  const base = await fixture(t);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('청약모아'));
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const res = await fetch(base + '/api/bootstrap');
  const data = await res.json();
  assert.equal(data.notices.length, 8);
  assert.ok(data.notices.every((n) => !['closed', 'cancelled'].includes(n.match.stage)));
  assert.ok(data.notices.every((n) => n.isDemo));
  assert.ok(!JSON.stringify(data).includes('SERVICE_KEY'));
});

test('활성 API는 마감·취소를 제외하고 일정 미확인은 남기며 저장된 이력을 삭제하지 않는다', async (t) => {
  const store = new Store(':memory:', { seed: false });
  const template = { ...demoNotices()[0], isDemo: false, sourceId: 'applyhome' };
  store.upsertBatch([
    { ...template, id: 'closed', deadline: '2000-01-01' },
    { ...template, id: 'cancelled', cancelled: true },
    { ...template, id: 'unknown', starts: null, deadline: null },
  ]);
  const base = await fixture(t, store);
  const data = await (await fetch(base + '/api/bootstrap')).json();
  assert.deepEqual(
    data.notices.map((notice) => notice.id),
    ['unknown'],
  );
  assert.equal(data.sources.find((source) => source.id === 'applyhome').count, 1);
  assert.equal(data.quality.total, 1);
  assert.equal(store.all().length, 3);
});
test('조건 저장・검증・관심 저장・개인정보 삭제', async (t) => {
  const base = await fixture(t);
  let r = await fetch(base + '/api/profile', {
    method: 'POST',
    headers,
    body: JSON.stringify({ regions: ['서울'], birthDate: '1998-01-01', housingOwned: 'no' }),
  });
  assert.equal(r.status, 200);
  let data = await (await fetch(base + '/api/bootstrap')).json();
  assert.equal(data.profile.regions[0], '서울');
  assert.ok(data.notices.some((n) => n.match.status === 'demo-match'));
  r = await fetch(base + '/api/profile', {
    method: 'POST',
    headers,
    body: JSON.stringify({ saleBudget: -10 }),
  });
  assert.equal(r.status, 400);
  await fetch(base + '/api/favorites', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: 'demo-01', saved: true }),
  });
  data = await (await fetch(base + '/api/bootstrap')).json();
  assert.equal(data.notices.find((n) => n.id === 'demo-01').favorite, true);
  await fetch(base + '/api/personal', { method: 'DELETE', headers });
  data = await (await fetch(base + '/api/bootstrap')).json();
  assert.deepEqual(data.profile, {});
  assert.ok(data.notices.every((n) => !n.favorite));
});
test('cross-origin·CSRF·DNS rebinding 요청을 차단한다', async (t) => {
  const base = await fixture(t);
  const foreign = await fetch(base + '/api/profile', {
    method: 'POST',
    headers: { ...headers, Origin: 'https://untrusted.example' },
    body: '{}',
  });
  assert.equal(foreign.status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(
      base + '/api/profile',
      { method: 'POST', headers: { ...headers, Host: 'untrusted.example' } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end('{}');
  });
  assert.equal(hostStatus, 403);
  const r = await fetch(base + '/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(r.status, 403);
});
test('키 없이 수집 성공을 가장하지 않는다', async (t) => {
  const base = await fixture(t);
  for (const path of ['/api/collect', '/api/refresh-data']) {
    const r = await fetch(base + path, { method: 'POST', headers, body: '{}' });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /인증키/);
  }
});
test('전체 갱신은 공고·게시판·APT 결과 수집을 실행하고 중복 요청을 차단한다', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cheongyak-manual-refresh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new Store(':memory:', { seed: false });
  store.upsert({
    ...demoNotices()[0],
    id: 'closed-apt',
    isDemo: false,
    sourceId: 'applyhome',
    externalId: '100:200',
    operation: 'getAPTLttotPblancDetail',
    deadline: '2000-01-01',
    winnerDate: '2000-01-02',
  });
  const requests: string[] = [];
  let allowApi: () => void = () => {};
  const waitForApi = new Promise<void>((resolve) => {
    allowApi = resolve;
  });
  const base = await fixture(t, store, {
    projectRoot: root,
    env: {
      APPLYHOME_SERVICE_KEY: 'application-test',
      APPLYHOME_RESULTS_SERVICE_KEY: 'results-test',
    },
    fetchFn: async (url: URL) => {
      requests.push(url.pathname);
      await waitForApi;
      return Response.json({ data: [], totalCount: 0, matchCount: 0, currentCount: 0 });
    },
    boardFetch: async (url: URL) => {
      requests.push(url.pathname);
      return new Response('User-agent: *\nDisallow: /\n');
    },
  });
  const post = () => fetch(base + '/api/refresh-data', { method: 'POST', headers, body: '{}' });
  try {
    assert.equal((await post()).status, 202);
    assert.equal((await post()).status, 409);
    const busy = await (await fetch(base + '/api/bootstrap')).json();
    assert.equal(busy.dataRefresh.state, 'running');
  } finally {
    allowApi();
  }
  const finished = await waitForRefresh(base);
  assert.equal(finished.collecting, false);
  assert.equal(finished.dataRefresh.state, 'partial');
  assert.ok(requests.some((url) => url.endsWith('getAPTLttotPblancDetail')));
  assert.ok(requests.some((url) => url.endsWith('getAptLttotPblancScore')));
  assert.ok(requests.includes('/robots.txt'));
  assert.doesNotMatch(JSON.stringify(finished), /application-test|results-test/);
});
async function waitForRefresh(base: string) {
  for (let i = 0; i < 100; i++) {
    const data = await (await fetch(base + '/api/bootstrap')).json();
    if (!data.collecting) return data;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('갱신 작업이 종료되지 않았습니다.');
}

test('운영 발행 설정 시 전체 갱신 버튼은 검증된 배포 작업의 성공과 실패를 표시한다', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cheongyak-manual-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  const publisher = join(root, 'scripts', 'publish-daily-data.mjs');
  writeFileSync(publisher, 'process.exit(0);');
  const base = await fixture(t, new Store(':memory:'), {
    projectRoot: root,
    env: { APPLYHOME_SERVICE_KEY: 'application-test', PUBLISH_DATA_ON_REFRESH: '1' },
    fetchFn: async () => {
      throw new Error('수집은 발행 프로세스에서 실행됩니다.');
    },
  });
  const post = () => fetch(base + '/api/refresh-data', { method: 'POST', headers, body: '{}' });
  assert.equal((await post()).status, 202);
  const published = await waitForRefresh(base);
  assert.equal(published.connection.publishOnRefresh, true);
  assert.equal(published.dataRefresh.state, 'success');
  assert.match(published.dataRefresh.message, /Vercel 배포/);
  writeFileSync(publisher, 'process.exit(1);');
  assert.equal((await post()).status, 202);
  const failed = await waitForRefresh(base);
  assert.equal(failed.dataRefresh.state, 'failed');
  assert.match(failed.dataRefresh.message, /daily-refresh.log/);
});
test('변경 이력 조회・없는 경로・과대 입력 처리', async (t) => {
  const base = await fixture(t);
  const versions = await (await fetch(base + '/api/versions/demo-01')).json();
  assert.equal(versions.length, 1);
  assert.equal((await fetch(base + '/not-found')).status, 404);
  const large = await fetch(base + '/api/profile', {
    method: 'POST',
    headers,
    body: JSON.stringify({ unknown: 'x'.repeat(17000) }),
  });
  assert.equal(large.status, 413);
});
