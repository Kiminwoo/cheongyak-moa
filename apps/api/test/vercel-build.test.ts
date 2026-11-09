import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createPreviewHandler } from '../src/preview-http.js';
import { Store } from '../src/core/store.js';
import { demoNotices } from '../src/core/demo.js';
import { previewData } from '../src/preview.js';
import {
  encodeSnapshot,
  decodeSnapshot,
  assertPublicSnapshot,
} from '../src/core/public-snapshot.js';
import { writePreviewPackage } from '../src/core/preview-package.js';

function snapshot(t) {
  const store = new Store(':memory:', { seed: false });
  t.after(() => store.close());
  const notice = {
    ...demoNotices()[0],
    isDemo: false,
    rules: [],
    rulesComplete: false,
    starts: null,
    deadline: null,
  };
  store.upsert(notice);
  store.saveProfile({ birthDate: '1991-02-03' });
  store.favorite(notice.id, true);
  return { ...previewData(store.db), snapshotAt: new Date().toISOString() };
}
test('Git 배포 사본은 공개 공고만 압축하고 개인 정보·관심 여부를 제외한다', (t) => {
  const publicData = snapshot(t);
  const decoded = decodeSnapshot(encodeSnapshot(publicData));
  assert.deepEqual(decoded.profile, {});
  assert.equal(decoded.notices[0].favorite, false);
  assert.equal(decoded.notices[0].match.preference.state, 'unset');
  assert.ok(!JSON.stringify(decoded).includes('1991-02-03'));
  assert.deepEqual(decoded.runs, []);
});
test('공개 조회는 인증·만료 없이 열리고 개인 API와 변경 요청은 차단한다', async (t) => {
  const publicData = snapshot(t);
  const server = createServer(
    createPreviewHandler({
      publicReadOnly: true,
      data: () => publicData,
      webDirectory: join(process.cwd(), 'apps/web/dist'),
      now: () => Date.now() + 100 * 86400000,
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  for (const path of ['/', '/app.js', '/api/bootstrap']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('www-authenticate'), null);
  }
  const data = await (await fetch(base + '/api/bootstrap')).json();
  assert.deepEqual(data.profile, {});
  assert.equal(data.notices[0].favorite, false);
  for (let i = 0; i < 31; i++)
    assert.equal(
      (await fetch(base + '/api/bootstrap', { headers: { Authorization: 'Basic wrong' } })).status,
      200,
    );
  for (const path of ['/api/profile', '/api/collect', '/api/favorites'])
    assert.equal((await fetch(base + path, { method: 'POST' })).status, 405);
  for (const path of ['/.env', '/access.json', '/data/cheongyak.sqlite', '/api/connection'])
    assert.equal((await fetch(base + path)).status, 404);
});

test('공개 사본에 개인 조건·관심·인증키·알 수 없는 항목을 넣거나 손상시키면 거부한다', (t) => {
  const publicData = snapshot(t);
  for (const mutate of [
    (data) => {
      data.profile.birthDate = '1991-02-03';
    },
    (data) => {
      data.notices[0].favorite = true;
    },
    (data) => {
      data.serviceKey = 'secret';
    },
    (data) => {
      data.notices[0].privateNote = 'private';
    },
    (data) => {
      data.connection.configured.applyhome = true;
    },
  ]) {
    const bad = structuredClone(publicData);
    mutate(bad);
    assert.throws(() => assertPublicSnapshot(bad));
  }
  const envelope = JSON.parse(encodeSnapshot(publicData));
  envelope.sha256 = '0'.repeat(64);
  assert.throws(() => decodeSnapshot(JSON.stringify(envelope)));
});
test('Vercel 빌드는 DB 없이 보호된 단일 함수와 빈 정적 디렉터리를 만든다', (t) => {
  const publicData = snapshot(t);
  const root = mkdtempSync(join(tmpdir(), 'vercel-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const web = join(root, 'apps/web/dist');
  mkdirSync(join(web, 'icons'), { recursive: true });
  mkdirSync(join(root, 'apps/api/dist'), { recursive: true });
  for (const file of [
    'index.html',
    'app.js',
    'style.css',
    'responsive.css',
    'favicon.svg',
    'icons/apple-touch-icon.png',
  ])
    writeFileSync(join(web, file), 'test asset');
  writeFileSync(join(root, 'apps/api/dist/preview-handler.mjs'), 'export default () => {};');
  assert.throws(() =>
    writePreviewPackage(root, publicData, { authorizationHash: '', expiresAt: Date.now() + 60000 }),
  );
  const fn = writePreviewPackage(root, publicData, { publicReadOnly: true });
  assert.deepEqual(JSON.parse(readFileSync(join(fn, 'access.json'), 'utf8')), {
    publicReadOnly: true,
  });
  assert.deepEqual(readdirSync(join(root, '.vercel/output/static')), []);
  const config = JSON.parse(readFileSync(join(root, '.vercel/output/config.json'), 'utf8'));
  assert.equal(config.routes[0].dest, '/index?__preview_path=$1');
  assert.equal(
    JSON.parse(readFileSync(join(fn, '.vc-config.json'), 'utf8')).launcherType,
    'Nodejs',
  );
  assert.deepEqual(JSON.parse(readFileSync(join(fn, 'notices.json'), 'utf8')).profile, {});
});
