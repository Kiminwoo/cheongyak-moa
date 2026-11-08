import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, workspaceResolver } from './build-config.mjs';
const ui = process.argv[2] === 'ui';
const folders = [
  ['api', 'apps/api/test'],
  ['web', 'apps/web/test'],
  ['domain', 'packages/domain/test'],
  ['tooling', 'test/tooling'],
];
const entries = {};
for (const [name, folder] of folders)
  for (const file of readdirSync(join(root, folder))) {
    if (ui ? file.endsWith('.test.tsx') : file.endsWith('.test.ts'))
      entries[name + '/' + file.replace(/\.tsx?$/, '')] = join(root, folder, file);
  }
await build({
  absWorkingDir: root,
  entryPoints: entries,
  outdir: join(root, '.test-build'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  target: 'node22',
  tsconfigRaw: {},
  plugins: [workspaceResolver(true)],
  logLevel: 'warning',
});
const tests = Object.keys(entries).map((name) => join(root, '.test-build', name + '.mjs'));
const result = spawnSync(process.execPath, ['--experimental-sqlite', '--test', ...tests], {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
