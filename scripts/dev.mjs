import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { root,webOptions,apiOptions,copyWebAssets } from './build-config.mjs';
copyWebAssets();
const web=await context({...webOptions(),minify:false,define:{'process.env.NODE_ENV':'"development"'}});
const api=await context(apiOptions());
await web.rebuild();await api.rebuild();await web.watch();await api.watch();
const child=spawn(process.execPath,['--experimental-sqlite','--watch','--env-file-if-exists=.env','apps/api/dist/server.mjs'],{cwd:root,stdio:'inherit'});
const assets=setInterval(copyWebAssets,2000);
async function close(){clearInterval(assets);child.kill();await web.dispose();await api.dispose();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
