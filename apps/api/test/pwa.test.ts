import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createApp } from '../src/server.js';
import { Store } from '../src/core/store.js';
const script = readFileSync(join(process.cwd(), 'apps/web/public/sw.js'), 'utf8');
function worker() {
  const handlers = {},
    saved = [],
    deleted = [];
  const cache = { addAll: async (urls) => saved.push(...urls), put: async () => {} };
  const context = {
    self: {
      location: { origin: 'http://localhost' },
      addEventListener: (type, fn) => (handlers[type] = fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => ['cheongyak-moa-shell-old', 'unrelated'],
      delete: async (key) => deleted.push(key),
      match: async () => undefined,
    },
    URL,
    Response,
    fetch: async () => new Response('asset'),
  };
  vm.runInNewContext(script, context);
  return { handlers, saved, deleted };
}
test('PWA는 화면 파일만 사전 저장한다', async () => {
  const w = worker();
  let pending;
  w.handlers.install({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.ok(w.saved.includes('/app.js'));
  assert.ok(w.saved.includes('/responsive.css'));
  assert.ok(w.saved.every((path) => !path.startsWith('/api/')));
});
test('PWA는 API·POST·외부 요청을 가로채거나 캐시하지 않는다', () => {
  const w = worker();
  for (const [method, url] of [
    ['GET', 'http://localhost/api/bootstrap'],
    ['GET', 'http://localhost/api/versions/test'],
    ['POST', 'http://localhost/api/profile'],
    ['GET', 'https://external.example/app.js'],
  ]) {
    let intercepted = false;
    w.handlers.fetch({ request: { method, url }, respondWith: () => (intercepted = true) });
    assert.equal(intercepted, false);
  }
});
test('캐시 갱신은 이 서비스의 이전 화면 캐시만 삭제한다', async () => {
  const w = worker();
  let pending;
  w.handlers.activate({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.deepEqual(w.deleted, ['cheongyak-moa-shell-old']);
});
test('manifest·PNG 아이콘·Service Worker의 형식과 응답을 검증한다', async (t) => {
  const store = new Store(':memory:'),
    { server } = createApp({ store, env: {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/manifest.webmanifest');
  assert.match(response.headers.get('content-type'), /application\/manifest\+json/);
  const manifest = await response.json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    const r = await fetch(base + icon.src);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const sw = await fetch(base + '/sw.js');
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.match(sw.headers.get('content-security-policy'), /worker-src 'self'/);
  const api = await fetch(base + '/api/bootstrap');
  assert.equal(api.headers.get('cache-control'), 'no-store');
});
