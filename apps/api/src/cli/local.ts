import { projectRoot, dataPaths } from '../paths.js';
import { Store } from '../core/store.js';
import { collectLocal } from '../core/local-collectors.js';
const paths = dataPaths(projectRoot(import.meta.url));
const store = new Store(paths.database);
try {
  for (const result of await collectLocal(store, { rawDir: paths.raw })) {
    console.log(`${result.source}: ${result.status} · ${result.count}건 · ${result.message}`);
    if (result.status === 'failed' || result.status === 'unconfigured') process.exitCode = 1;
  }
} finally {
  store.close();
}
