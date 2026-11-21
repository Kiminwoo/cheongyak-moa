import { projectRoot as findProjectRoot, dataPaths } from '../paths.js';
import { Store } from '../core/store.js';
import { collect } from '../core/collectors.js';
import { collectPrices } from '../core/prices.js';
import { collectLocal } from '../core/local-collectors.js';
import { collectBoards } from '../core/board-collectors.js';
const onlyFailed = process.argv.includes('--retry-failed');
const withBoards = process.argv.includes('--boards');
const allDates = process.argv.includes('--all-dates');
const includeClosed = process.argv.includes('--include-closed');
const supported = ['--retry-failed', '--boards', '--all-dates', '--include-closed'];
if (process.argv.slice(2).some((arg) => !supported.includes(arg)))
  throw new Error('지원 옵션: ' + supported.join(', '));
const root = findProjectRoot(import.meta.url);
const paths = dataPaths(root);
const store = new Store(paths.database);
try {
  if (allDates)
    console.log(
      '청약홈 5개 유형은 모집공고일 제한 없이 조회합니다. LH는 설정된 조회 기간을 사용합니다.',
    );
  if (includeClosed) console.log('조회된 마감·취소 공고도 로컬 DB에 보관합니다.');
  const options = { rawDir: paths.raw, onlyFailed, includeClosed };
  const results = await collect(store, { ...options, allDates });
  for (const r of results) console.log(`${r.source}: ${r.status} · ${r.count}건 · ${r.message}`);
  if (results.some((r) => r.status === 'failed' || (includeClosed && r.status === 'unconfigured')))
    process.exitCode = 1;
  for (const result of await collectLocal(store, options)) {
    console.log(`${result.source}: ${result.status} · ${result.count}건 · ${result.message}`);
    if (result.status === 'failed' || (includeClosed && result.status === 'unconfigured'))
      process.exitCode = 1;
  }
  if (withBoards)
    for (const result of await collectBoards(store, options)) {
      console.log(
        `${result.source}/board: ${result.status} · ${result.count}건 · ${result.code ?? ''} · ${result.message}`,
      );
      if (result.status === 'failed') process.exitCode = 1;
    }
  if (
    !onlyFailed &&
    results.some((r) => r.source === 'applyhome' && (r.status === 'success' || r.count > 0))
  ) {
    console.log('청약홈 주택형별 가격 조회를 시작합니다. 공고 수에 따라 수분이 소요됩니다.');
    const prices = await collectPrices(store, { rawDir: paths.raw });
    console.log(prices.message);
    if (prices.failed) process.exitCode = 1;
  }
  const coverage = store.coverage();
  console.log(
    `수집 범위 점검 · 성공 ${coverage.filter((unit) => unit.status === 'success').length} · 실패 ${coverage.filter((unit) => unit.status === 'failed').length} · 미실행 ${coverage.filter((unit) => unit.status === 'not-run').length} · 미연동 ${coverage.filter((unit) => unit.status === 'planned').length} · 전국 전체 수집을 보장하지 않습니다.`,
  );
} finally {
  store.close();
}
