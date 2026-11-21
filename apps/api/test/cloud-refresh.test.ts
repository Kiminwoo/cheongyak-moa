import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cloudRefreshJobs } from '../src/core/cloud-jobs.js';
import { snapshotPublisher } from '../src/core/snapshot-publish.js';

test('클라우드 작업은 등록된 수집 명령만 실행하고 진행 중인 작업을 재사용한다', async () => {
  const env = { RENDER_REFRESH_SERVICE_ID: 'crn-mock', RENDER_REFRESH_API_KEY: 'test-key' };
  const job = {
    id: 'job-0123456789abcdefghij',
    serviceId: 'crn-mock',
    startCommand: 'npm run data:cloud',
    status: 'running',
    createdAt: '2026-11-21T00:00:00Z',
  };
  let active = false;
  let launches = 0;
  const api = cloudRefreshJobs(env, async (input, options) => {
    assert.equal(new URL(input.toString()).origin, 'https://api.render.com');
    if (options?.method === 'POST') {
      assert.deepEqual(JSON.parse(String(options.body)), { startCommand: job.startCommand });
      launches++;
      active = true;
      return Response.json(job, { status: 201 });
    }
    return Response.json(active ? [{ job }] : []);
  });
  assert.ok(api);
  assert.equal(await api.status(), null);
  const [first, second] = await Promise.all([api.start(), api.start()]);
  assert.deepEqual(first, second);
  assert.deepEqual(await api.start(), first);
  assert.equal(launches, 1);
  assert.equal(cloudRefreshJobs({}, fetch), null);
});

test('클라우드 발행은 직전 사본과 같은 SHA로만 main의 공개 파일을 갱신한다', async () => {
  const encoded = readFileSync('apps/api/snapshots/public-notices.snapshot.json', 'utf8');
  const sha = 'f'.repeat(40);
  const publisher = snapshotPublisher('test-key', async (input, options) => {
    const url = new URL(input.toString());
    assert.equal(url.origin, 'https://api.github.com');
    assert.ok(url.pathname.endsWith('/contents/apps/api/snapshots/public-notices.snapshot.json'));
    if (options?.method === 'PUT') {
      const body = JSON.parse(String(options.body));
      assert.equal(body.sha, sha);
      assert.equal(body.branch, 'main');
      assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), encoded);
      return Response.json({}, { status: 409 });
    }
    assert.equal(url.searchParams.get('ref'), 'main');
    return Response.json({
      sha,
      encoding: 'base64',
      content: Buffer.from(encoded).toString('base64'),
    });
  });
  const { sha: expectedSha, snapshot } = await publisher.load();
  assert.equal(expectedSha, sha);
  assert.ok(snapshot.notices.length);
  await assert.rejects(publisher.publish(encoded, expectedSha), /409/);
});
