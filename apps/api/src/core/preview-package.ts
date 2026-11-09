import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { BootstrapData } from '@cheongyak-moa/contracts';
import { assertPublicSnapshot } from './public-snapshot.js';

export function writePreviewPackage(
  root: string,
  snapshot: BootstrapData,
  authorizationHash: string,
  expiresAt: number,
) {
  assertPublicSnapshot(snapshot);
  if (
    !/^[a-f0-9]{64}$/.test(authorizationHash) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  )
    throw new Error('유효한 미리보기 인증 설정이 필요합니다.');
  const output = resolve(root, '.vercel', 'output');
  if (relative(resolve(root, '.vercel'), output) !== 'output') throw new Error('잘못된 출력 경로');
  if (existsSync(output)) {
    if (lstatSync(output).isSymbolicLink() || !existsSync(join(output, '.cheongyak-preview')))
      throw new Error('다른 Vercel 빌드 결과를 덮어쓸 수 없습니다.');
    rmSync(output, { recursive: true });
  }
  const fn = join(output, 'functions', 'index.func');
  mkdirSync(join(fn, 'web', 'icons'), { recursive: true });
  mkdirSync(join(output, 'static'), { recursive: true });
  const json = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));
  writeFileSync(join(output, '.cheongyak-preview'), 'read-only-public-notices');
  json(join(output, 'config.json'), {
    version: 3,
    routes: [{ src: '/(.*)', dest: '/index?__preview_path=$1' }],
  });
  json(join(fn, '.vc-config.json'), {
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    maxDuration: 10,
  });
  json(join(fn, 'access.json'), { authorizationHash, expiresAt });
  json(join(fn, 'notices.json'), snapshot);
  for (const file of [
    'index.html',
    'app.js',
    'style.css',
    'responsive.css',
    'favicon.svg',
    'icons/apple-touch-icon.png',
  ])
    cpSync(join(root, 'apps', 'web', 'dist', file), join(fn, 'web', file));
  cpSync(join(root, 'apps', 'api', 'dist', 'preview-handler.mjs'), join(fn, 'index.mjs'));
  return fn;
}
