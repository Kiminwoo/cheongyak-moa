import { projectRoot as findProjectRoot, dataPaths } from '../paths.js';
import { Store } from '../core/store.js';
import { collect } from '../core/collectors.js';
import { fileURLToPath } from 'node:url';
const root = findProjectRoot(import.meta.url);
const paths = dataPaths(root);
const store = new Store(paths.database);
try {
  const results = await collect(store, { rawDir: paths.raw });
  for (const r of results) console.log(`${r.source}: ${r.status} · ${r.count}건 · ${r.message}`);
  if (results.some((r) => r.status === 'failed')) process.exitCode = 1;
} finally {
  store.close();
}
