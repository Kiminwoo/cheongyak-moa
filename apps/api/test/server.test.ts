import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { Store } from '../src/core/store.js';
import { request } from 'node:http';
import { demoNotices } from '../src/core/demo.js';
async function fixture(t, store = new Store(':memory:')) {
  const { server } = createApp({ store, env: {} });
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
  const r = await fetch(base + '/api/collect', { method: 'POST', headers, body: '{}' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /인증키/);
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
