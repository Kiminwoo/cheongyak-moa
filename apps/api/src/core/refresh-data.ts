import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from '@cheongyak-moa/contracts';
import type { Store } from './store.js';
import { collect } from './collectors.js';
import { collectLocal } from './local-collectors.js';
import { collectBoards } from './board-collectors.js';
import { collectAptResults } from './applyhome-results.js';
import { myhomeKey } from './config.js';
import { collectPrices } from './prices.js';
import { refreshPolicy } from './refresh-policy.js';
import { exportPublicSnapshot } from './snapshot-export.js';
export function missingRefreshKeys(env: Environment) {
  return [
    ['APPLYHOME_SERVICE_KEY', env.APPLYHOME_SERVICE_KEY],
    ['LH_SERVICE_KEY', env.LH_SERVICE_KEY],
    ['MYHOME_SERVICE_KEY 또는 LH_SERVICE_KEY', myhomeKey(env)],
    ['APPLYHOME_RESULTS_SERVICE_KEY', env.APPLYHOME_RESULTS_SERVICE_KEY],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);
}

export async function refreshData(
  store: Store,
  {
    root,
    rawDir,
    env = process.env,
    strict,
  }: {
    root: string;
    rawDir: string;
    env?: Environment;
    strict: boolean;
  },
) {
  const startedAt = new Date().toISOString();
  const resultsConfigured = Boolean(env.APPLYHOME_RESULTS_SERVICE_KEY?.trim());
  console.log('전체 API 수집 → 게시판 점검 → 가격 보강 → 검증 → 공개 사본 갱신을 시작합니다.');
  for (const result of await collect(store, {
    rawDir,
    env,
    allDates: true,
    includeClosed: resultsConfigured,
  }))
    console.log(`${result.source}: ${result.status} · ${result.count}건 · ${result.message}`);
  for (const result of await collectLocal(store, { rawDir, env, includeIh: !strict }))
    console.log(`${result.source}: ${result.status} · ${result.count}건 · ${result.message}`);
  for (const result of await collectBoards(store, { rawDir, env }))
    console.log(
      `${result.source}/board: ${result.status} · ${result.code ?? ''} · ${result.message}`,
    );
  const apiReady = refreshPolicy(store.coverage(), startedAt, 0).blocked.length === 0;
  let prices: Awaited<ReturnType<typeof collectPrices>> | null = null;
  if (apiReady) {
    prices = await collectPrices(store, { rawDir, env });
    console.log(prices.message);
  }
  const aptResults = resultsConfigured ? await collectAptResults(store) : null;
  if (aptResults) console.log(aptResults.message);
  const coverage = store.coverage();
  const policy = refreshPolicy(coverage, startedAt, prices?.failed ?? 0);
  let snapshotAt: string | null = null;
  const resultsBlocked = strict && !!aptResults?.failed;
  if (policy.snapshotAllowed && !resultsBlocked) {
    const snapshot = exportPublicSnapshot(store.db, root, env);
    snapshotAt = snapshot.snapshotAt ?? null;
    console.log(
      `공개 사본 갱신 · ${snapshot.notices.length}건 · 일정 미확인 ${snapshot.quality.missingSchedule}건 · 가격 미확인 ${snapshot.quality.missingPrice}건`,
    );
    console.log(
      'Git 배포 사본을 검토·커밋·푸시하면 Vercel에 반영됩니다. 이 명령은 배포하지 않습니다.',
    );
  } else {
    console.log(
      `검증 미완료 · API 미완료 ${policy.blocked.length}개 · 가격 실패 ${policy.priceFailures}건 · 청약홈 결과 실패 ${aptResults?.failed ?? 0}건 · 기존 배포 사본 유지`,
    );
  }
  if (policy.limited.length)
    console.log(`별도 확인이 필요한 수집 경로: ${policy.limited.join(', ')} · 전국 연동 완료 아님`);
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(
    join(root, 'data', 'refresh-report.json'),
    JSON.stringify(
      {
        startedAt,
        endedAt: new Date().toISOString(),
        ...policy,
        snapshotAllowed: policy.snapshotAllowed && !resultsBlocked,
        snapshotAt,
        units: coverage,
        aptResults,
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
  return snapshotAt;
}
