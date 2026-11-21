import type { CollectionResult, Environment, FetchJSON } from '@cheongyak-moa/contracts';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { collectAptResults } from './applyhome-results.js';
import { collectBoards } from './board-collectors.js';
import type { BoardFetch } from './board-http.js';
import { collect } from './collectors.js';
import { collectLocal } from './local-collectors.js';
import { collectPrices } from './prices.js';
import type { Store } from './store.js';

export async function publishFromLocalApp(root: string, env: Environment) {
  return promisify(execFile)(process.execPath, [join(root, 'scripts', 'publish-daily-data.mjs')], {
    cwd: root,
    env,
    windowsHide: true,
  });
}

export async function refreshLocalData(
  store: Store,
  {
    env,
    fetchFn,
    boardFetch,
    rawDir,
    onStage,
  }: {
    env: Environment;
    fetchFn: FetchJSON;
    boardFetch: BoardFetch;
    rawDir: string;
    onStage: (message: string) => void;
  },
) {
  const request = { env, fetchFn, rawDir };
  const details: string[] = [];
  let succeeded = false;
  let incomplete = false;
  function report(label: string, results: CollectionResult[]) {
    for (const result of results) {
      const ok = result.status === 'success';
      succeeded ||= ok || result.count > 0;
      incomplete ||= !ok || result.code === 'page_limit';
      if (!ok || result.code === 'page_limit')
        details.push(`${label} ${result.source.toUpperCase()} · ${result.message}`);
    }
  }
  async function run(label: string, task: () => Promise<void>) {
    onStage(label);
    try {
      await task();
    } catch {
      incomplete = true;
      details.push(`${label} 단계가 중단되었습니다. 설정과 데이터 저장소를 확인해 주세요.`);
    }
  }

  let applyhomeReady = false;
  await run('청약홈·LH 공고 조회', async () => {
    const results = await collect(store, {
      ...request,
      allDates: true,
      includeClosed: !!env.APPLYHOME_RESULTS_SERVICE_KEY?.trim(),
    });
    report('공고 API', results);
    applyhomeReady = results.some(
      (result) =>
        result.source === 'applyhome' && (result.status === 'success' || result.count > 0),
    );
  });
  await run('마이홈 공공주택 공고 조회', async () => {
    report('마이홈', await collectLocal(store, { ...request, includeIh: false }));
  });
  await run('SH·GH 공식 게시판 조회', async () => {
    report('게시판', await collectBoards(store, { env, fetchFn: boardFetch, rawDir }));
  });
  if (applyhomeReady)
    await run('주택형별 공급 정보 조회', async () => {
      const result = await collectPrices(store, request);
      incomplete ||= result.failed > 0;
      details.push(result.message);
    });
  if (env.APPLYHOME_RESULTS_SERVICE_KEY?.trim())
    await run('APT 경쟁률·가점·특별공급 결과 조회', async () => {
      const result = await collectAptResults(store, request);
      succeeded ||= result.updated > 0;
      incomplete ||= result.failed > 0;
      details.push(result.message);
    });
  else {
    incomplete = true;
    details.push('청약홈 APT 결과 · 경쟁률 API 인증키 미설정');
  }
  return { succeeded, incomplete, details };
}
