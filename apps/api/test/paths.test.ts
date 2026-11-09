import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { dataPaths } from '../src/paths.js';
import { Store } from '../src/core/store.js';
import { createApp } from '../src/server.js';
import { demoNotices } from '../src/core/demo.js';

test('끝 구분자 없는 프로젝트에서도 CLI 저장 경로와 API 조회 경로가 일치한다', async (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'moa-paths-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const root = join(folder, 'project with spaces');
  const paths = dataPaths(root);
  assert.deepEqual(paths, dataPaths(root + sep));
  assert.equal(paths.database, join(root, 'data', 'cheongyak.sqlite'));
  assert.equal(paths.raw, join(root, 'data', 'raw'));
  const collector = new Store(paths.database, { seed: false });
  const notice = {
    ...demoNotices()[0],
    id: 'live-path-test',
    isDemo: false,
    sourceId: 'applyhome',
  };
  collector.upsert(notice);
  collector.close();
  assert.equal(existsSync(root + 'data'), false);
  const store = new Store(dataPaths(root).database, { seed: false });
  const { server } = createApp({ store, env: {}, projectRoot: root });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/bootstrap`);
    const data = await response.json();
    assert.equal(data.notices.length, 1);
    assert.equal(data.notices[0].id, notice.id);
    assert.equal(data.sources.find((source) => source.id === 'applyhome').count, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
