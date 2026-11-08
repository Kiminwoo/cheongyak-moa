import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['frontend/main.jsx'],
  outfile: 'public/app.js',
  bundle: true,
  minify: true,
  sourcemap: true,
  legalComments: 'eof',
  jsx: 'automatic',
  format: 'esm',
  target: ['es2022'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info'
});
