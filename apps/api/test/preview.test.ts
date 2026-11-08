import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../src/core/store.js';
import { demoNotices } from '../src/core/demo.js';
import { createPreview } from '../src/preview.js';

const password = 'test-only-preview-password-123456789';
const auth = { Authorization: 'Basic ' + Buffer.from('preview:' + password).toString('base64') };
async function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'cheongyak-preview-'));
  const database = join(folder, 'notices.sqlite');
  const store = new Store(database, { seed: false });
  const notice = {
    ...demoNotices()[0],
    id: 'public-live',
    sourceId: 'applyhome',
    isDemo: false,
    starts: null,
    deadline: null,
    rules: [],
    rulesComplete: false,
    privateNote: 'internal-only-note',
  };
  store.upsertBatch([
    notice,
    { ...notice, id: 'expired', deadline: '2000-01-01' },
    { ...notice, id: 'demo', isDemo: true },
  ]);
  store.saveProfile({ birthDate: '1991-02-03', saleBudget: 123456 });
  store.favorite(notice.id, true);
  let now = Date.now();
  const { server, close } = createPreview({
    database,
    webDirectory: resolve('apps/web/dist'),
    password,
    expiresAt: now + 3600000,
    now: () => now,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  });
  return {
    store,
    advance: (ms) => {
      now += ms;
    },
    base: `http://127.0.0.1:${server.address().port}`,
  };
}

test('비밀번호로 HTML·공고·정적 파일을 보호하고 개인 정보를 제외한다', async (t) => {
  const { base } = await fixture(t);
  for (const path of ['/', '/app.js', '/style.css', '/api/bootstrap']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate'), /Basic/);
    assert.match(res.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await fetch(base, { headers: { Authorization: 'Basic wrong' } })).status, 401);
  const html = await (await fetch(base, { headers: auth })).text();
  assert.match(html, /cheongyak-preview/);
  assert.ok(!html.includes('rel="manifest"'));
  const res = await fetch(base + '/api/bootstrap', { headers: auth });
  assert.equal(res.status, 200);
  const text = await res.text();
  const data = JSON.parse(text);
  assert.equal(data.readOnly, true);
  assert.deepEqual(data.profile, {});
  assert.deepEqual(data.runs, []);
  assert.equal(data.notices.length, 1);
  assert.equal(data.notices[0].favorite, false);
  assert.equal(data.notices[0].match.preference.state, 'unset');
  for (const secret of ['1991-02-03', '123456', 'internal-only-note'])
    assert.ok(!text.includes(secret));
});

test('공유 서버는 변경 요청·비밀 파일·관리 API를 차단하고 DB를 유지한다', async (t) => {
  const { base, store } = await fixture(t);
  for (const [method, path] of [
    ['POST', '/api/profile'],
    ['DELETE', '/api/personal'],
    ['POST', '/api/collect'],
    ['POST', '/api/favorites'],
    ['POST', '/api/collect-boards'],
  ])
    assert.equal((await fetch(base + path, { method, headers: auth })).status, 405);
  for (const path of [
    '/.env',
    '/data/cheongyak.sqlite',
    '/api/connection',
    '/api/versions/public-live',
    '/sw.js',
    '/app.js.map',
    '/index.mjs',
    '/notices.json',
    '/access.json',
  ])
    assert.equal((await fetch(base + path, { headers: auth })).status, 404);
  assert.equal(store.profile().birthDate, '1991-02-03');
  assert.equal(store.get('public-live').favorite, true);
});

test('공유가 만료되면 올바른 비밀번호로도 조회할 수 없다', async (t) => {
  const { base, advance } = await fixture(t);
  advance(3600001);
  assert.equal((await fetch(base + '/api/bootstrap', { headers: auth })).status, 410);
});

test('반복된 비밀번호 실패를 제한하고 제한 시간이 지나면 복구한다', async (t) => {
  const { base, advance } = await fixture(t);
  for (let i = 0; i < 30; i++)
    assert.equal((await fetch(base, { headers: { Authorization: 'Basic wrong' } })).status, 401);
  assert.equal((await fetch(base, { headers: auth })).status, 429);
  advance(60001);
  assert.equal((await fetch(base, { headers: auth })).status, 200);
});
