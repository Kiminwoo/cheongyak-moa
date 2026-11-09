import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot, dataPaths } from '../paths.js';
import { Store } from '../core/store.js';
import { collect } from '../core/collectors.js';
import { collectLocal } from '../core/local-collectors.js';
import { collectBoards } from '../core/board-collectors.js';
import { collectPrices } from '../core/prices.js';
import { refreshPolicy } from '../core/refresh-policy.js';
import { exportPublicSnapshot } from '../core/snapshot-export.js';
const root = projectRoot(import.meta.url);
const paths = dataPaths(root);
const store = new Store(paths.database, { seed: false });
const startedAt = new Date().toISOString();
try {
  console.log('전체 API 수집 → 게시판 점검 → 가격 보강 → 검증 → 공개 사본 갱신을 시작합니다.');
  for (const result of await collect(store, { rawDir: paths.raw, allDates: true }))
    console.log(`${result.source}: ${result.status} · ${result.count}건 · ${result.message}`);
  for (const result of await collectLocal(store, { rawDir: paths.raw }))
    console.log(`${result.source}: ${result.status} · ${result.count}건 · ${result.message}`);
  for (const result of await collectBoards(store, { rawDir: paths.raw }))
    console.log(
      `${result.source}/board: ${result.status} · ${result.code ?? ''} · ${result.message}`,
    );
  const apiReady = refreshPolicy(store.coverage(), startedAt, 0).blocked.length === 0;
  let prices: Awaited<ReturnType<typeof collectPrices>> | null = null;
  if (apiReady) {
    prices = await collectPrices(store, { rawDir: paths.raw });
    console.log(prices.message);
  }
  const coverage = store.coverage();
  const policy = refreshPolicy(coverage, startedAt, prices?.failed ?? 0);
  let snapshotAt: string | null = null;
  if (policy.snapshotAllowed) {
    const snapshot = exportPublicSnapshot(store.db, root);
    snapshotAt = snapshot.snapshotAt ?? null;
    console.log(
      `공개 사본 갱신 · ${snapshot.notices.length}건 · 일정 미확인 ${snapshot.quality.missingSchedule}건 · 가격 미확인 ${snapshot.quality.missingPrice}건`,
    );
    console.log(
      'Git 배포 사본을 검토·커밋·푸시하면 Vercel에 반영됩니다. 이 명령은 배포하지 않습니다.',
    );
  } else {
    process.exitCode = 1;
    console.log(
      `검증 미완료 · API 미완료 ${policy.blocked.length}개 · 가격 실패 ${policy.priceFailures}건 · 기존 배포 사본 유지`,
    );
  }
  if (policy.limited.length)
    console.log(`별도 확인이 필요한 게시판: ${policy.limited.join(', ')} · 전국 연동 완료 아님`);
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(
    join(root, 'data', 'refresh-report.json'),
    JSON.stringify(
      {
        startedAt,
        endedAt: new Date().toISOString(),
        ...policy,
        snapshotAt,
        units: coverage,
        prices: prices
          ? {
              updated: prices.updated,
              empty: prices.empty,
              failed: prices.failed,
              unqueried: prices.unqueried,
            }
          : null,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('점검 보고서: data/refresh-report.json (Git 제외)');
} finally {
  store.close();
}
