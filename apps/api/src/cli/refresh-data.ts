import { projectRoot, dataPaths } from '../paths.js';
import { Store } from '../core/store.js';
import { missingRefreshKeys, refreshData } from '../core/refresh-data.js';

const root = projectRoot(import.meta.url);
const paths = dataPaths(root);
const strict = process.argv.includes('--daily');
const missing = strict ? missingRefreshKeys(process.env) : [];
if (missing.length) {
  console.error(`일일 갱신에 필요한 설정 · ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  const store = new Store(paths.database, { seed: false });
  try {
    if (!(await refreshData(store, { root, rawDir: paths.raw, strict }))) process.exitCode = 1;
  } finally {
    store.close();
  }
}
