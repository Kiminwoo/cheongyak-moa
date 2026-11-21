import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../core/store.js';
import { missingRefreshKeys, refreshData } from '../core/refresh-data.js';
import { snapshotPath, snapshotPublisher } from '../core/snapshot-publish.js';

const token = process.env.GITHUB_PUBLISH_TOKEN?.trim();
const missing = missingRefreshKeys(process.env);
if (!token || missing.length) {
  console.error('클라우드 수집 서비스에 공공데이터 인증키와 GitHub 발행 권한을 설정해 주세요.');
  process.exitCode = 1;
} else {
  const root = mkdtempSync(join(tmpdir(), 'cheongyak-cloud-refresh-'));
  let store: Store | undefined;
  let stage = '기존 공개 사본 조회';
  try {
    const publisher = snapshotPublisher(token);
    const { sha, snapshot } = await publisher.load();
    store = new Store(join(root, 'housing.sqlite'), { seed: false });
    store.upsertBatch(
      [...snapshot.notices, ...(snapshot.pastResults ?? [])].map(
        ({ favorite, version, updatedAt, lastSeenAt, match, ...notice }) => notice,
      ),
    );
    stage = '데이터 수집·검증';
    const snapshotAt = await refreshData(store, {
      root,
      rawDir: join(root, 'data', 'raw'),
      strict: true,
    });
    if (!snapshotAt) throw new Error('필수 API 또는 결과 검증 실패');
    stage = 'GitHub 사본 발행';
    await publisher.publish(readFileSync(join(root, snapshotPath), 'utf8'), sha);
    console.log(`공개 사본 발행 완료 · ${snapshotAt} · Vercel 배포 요청`);
  } catch {
    console.error(`클라우드 갱신 실패 · ${stage} 단계에서 중단됐습니다.`);
    process.exitCode = 1;
  } finally {
    store?.close();
    rmSync(root, { recursive: true, force: true });
  }
}
