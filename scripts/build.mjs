import { build } from 'esbuild';
import { webOptions, apiOptions, copyWebAssets } from './build-config.mjs';
const scope = process.argv[2];
if (!scope || scope === 'web') {
  copyWebAssets();
  await build(webOptions());
}
if (!scope || scope === 'api') await build(apiOptions());
