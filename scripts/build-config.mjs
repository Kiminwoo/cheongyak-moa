import { createRequire } from 'node:module';
import { existsSync, readFileSync, cpSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const aliases = {
  '@cheongyak-moa/contracts': join(root, 'packages/contracts/src/index.ts'),
  '@cheongyak-moa/domain': join(root, 'packages/domain/src/index.ts'),
};

// 프로젝트 내부의 명시적 경로만 로드합니다. Windows의 상위 디렉터리 열람이나
// 전역 패키지에 의존하지 않고, Node의 패키지 해석과 워크스페이스 별칭을 사용합니다.
export function workspaceResolver(externalPackages = false) {
  return {
    name: 'workspace-resolver',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path.startsWith('node:')) return { path: args.path, external: true };
        if (aliases[args.path]) return { path: aliases[args.path] };
        const relative =
          args.path.startsWith('.') || args.path.startsWith('/') || /^[A-Za-z]:/.test(args.path);
        if (!relative && args.kind !== 'entry-point') {
          if (externalPackages) return { path: args.path, external: true };
          return { path: require.resolve(args.path, { paths: [args.resolveDir || root, root] }) };
        }
        const path = resolve(args.resolveDir || root, args.path);
        const choices = [
          path,
          path.replace(/\.js$/, '.ts'),
          path.replace(/\.js$/, '.tsx'),
          path + '.ts',
          path + '.tsx',
          path + '.js',
          join(path, 'index.ts'),
          join(path, 'index.js'),
        ];
        const found = choices.find((file) => existsSync(file) && !file.endsWith('/'));
        if (!found) throw new Error('Cannot resolve project module: ' + args.path);
        return { path: found };
      });
      build.onLoad({ filter: /.*/ }, (args) => {
        const extension = extname(args.path).slice(1);
        const loader = ['ts', 'tsx', 'jsx', 'json', 'css'].includes(extension) ? extension : 'js';
        return {
          contents: readFileSync(args.path, 'utf8'),
          loader,
          resolveDir: dirname(args.path),
          watchFiles: [args.path],
        };
      });
    },
  };
}
export function copyWebAssets() {
  const output = join(root, 'apps/web/dist');
  mkdirSync(output, { recursive: true });
  cpSync(join(root, 'apps/web/public'), output, {
    recursive: true,
    filter: (path) => !['app.js', 'app.js.map'].includes(basename(path)),
  });
}
export function webOptions() {
  return {
    absWorkingDir: root,
    entryPoints: [join(root, 'apps/web/src/main.tsx')],
    outfile: join(root, 'apps/web/dist/app.js'),
    bundle: true,
    minify: true,
    sourcemap: true,
    legalComments: 'eof',
    jsx: 'automatic',
    tsconfigRaw: {},
    format: 'esm',
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [workspaceResolver()],
    logLevel: 'info',
  };
}
export function apiOptions() {
  return {
    absWorkingDir: root,
    entryPoints: {
      server: join(root, 'apps/api/src/main.ts'),
      'preview-handler': join(root, 'apps/api/src/vercel-preview.ts'),
      ...Object.fromEntries(
        [
          'collect',
          'coverage',
          'local',
          'boards',
          'prices',
          'doctor',
          'import-response',
          'setup-env',
          'preview',
          'preview-vercel',
        ].map((name) => ['cli/' + name, join(root, `apps/api/src/cli/${name}.ts`)]),
      ),
    },
    outdir: join(root, 'apps/api/dist'),
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: true,
    tsconfigRaw: {},
    plugins: [workspaceResolver(true)],
    logLevel: 'info',
  };
}
