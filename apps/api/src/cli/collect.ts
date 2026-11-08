import { projectRoot as findProjectRoot, dataPaths } from '../paths.js';
import { Store } from '../core/store.js';
import { collect } from '../core/collectors.js';
import { collectPrices } from '../core/prices.js';
import { fileURLToPath } from 'node:url';
const root = findProjectRoot(import.meta.url);
const paths = dataPaths(root);
const store = new Store(paths.database);
try {
  const results = await collect(store, { rawDir: paths.raw });
  for (const r of results) console.log(`${r.source}: ${r.status} · ${r.count}건 · ${r.message}`);
  if (results.some((r) => r.status === 'failed')) process.exitCode = 1;
  if (results.some((r) => r.source === 'applyhome' && r.status === 'success')) {
    console.log('청약홈 주택형별 가격 조회를 시작합니다. 공고 수에 따라 수분이 소요됩니다.');
    const prices = await collectPrices(store, { rawDir: paths.raw });
    console.log(prices.message);
    if (prices.failed) process.exitCode = 1;
  }
} finally {
  store.close();
}
