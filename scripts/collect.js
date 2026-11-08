import { Store } from '../src/store.js';
import { collect } from '../src/collectors.js';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const store = new Store(root+'data/cheongyak.sqlite');
try {
  const results = await collect(store,{rawDir:root+'data/raw'});
  for(const r of results) console.log(`${r.source}: ${r.status} · ${r.count}건 · ${r.message}`);
  if(results.some(r=>r.status==='failed')) process.exitCode=1;
} finally { store.close(); }
