import { projectRoot, dataPaths } from '../paths.js';
import { Store } from '../core/store.js';
import { collectAptResults } from '../core/applyhome-results.js';

const paths = dataPaths(projectRoot(import.meta.url));
const store = new Store(paths.database, { seed: false });
try {
  const result = await collectAptResults(store);
  console.log(result.message);
  if (result.failed) process.exitCode = 1;
} catch {
  console.error('청약홈 결과 수집을 시작하지 못했습니다. 인증키와 로컬 DB를 확인해 주세요.');
  process.exitCode = 1;
} finally {
  store.close();
}
