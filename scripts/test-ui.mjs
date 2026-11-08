import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(new URL('../.test-build/',import.meta.url),{recursive:true});
await build({absWorkingDir:root,entryPoints:['test/ui.test.jsx'],outfile:'.test-build/ui.test.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',logLevel:'warning'});
const result=spawnSync(process.execPath,['--experimental-sqlite','--test','.test-build/ui.test.mjs'],{cwd:root,stdio:'inherit'});
process.exitCode=result.status??1;
