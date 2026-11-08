import { projectRoot, dataPaths } from '../paths.js';
import { Store } from '../core/store.js';
import { collectPrices } from '../core/prices.js';
const paths = dataPaths(projectRoot(import.meta.url));
const store = new Store(paths.database);
try {
  console.log(
    '기존 청약홈 공고의 주택형별 가격 조회를 시작합니다. 공고 수에 따라 수분이 소요됩니다.',
  );
  const result = await collectPrices(store, { rawDir: paths.raw });
  console.log(result.message);
  if (result.failed) process.exitCode = 1;
} catch {
  console.error('가격 수집을 시작하지 못했습니다. 인증키 설정과 저장소 접근 상태를 확인해 주세요.');
  process.exitCode = 1;
} finally {
  store.close();
}
