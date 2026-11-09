import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../paths.js';
import { decodeSnapshot } from '../core/public-snapshot.js';
import { writePreviewPackage } from '../core/preview-package.js';
const root = projectRoot(import.meta.url);
const authorizationHash = process.env.PREVIEW_AUTH_HASH?.trim() || '';
if (!/^[a-f0-9]{64}$/.test(authorizationHash))
  throw new Error('Vercel에 PREVIEW_AUTH_HASH 설정이 필요합니다. 인증 없이 배포하지 않습니다.');
const hours = Number(process.env.PREVIEW_HOURS || 8);
if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
  throw new Error('미리보기 유효 시간은 0 초과 24시간 이하여야 합니다.');
const snapshot = decodeSnapshot(
  readFileSync(join(root, 'apps', 'api', 'snapshots', 'public-notices.snapshot.json'), 'utf8'),
);
writePreviewPackage(root, snapshot, authorizationHash, Date.now() + hours * 3600000);
console.log(
  `Vercel Git 빌드 완료 · 공개 공고 ${snapshot.notices.length}건 · 사본 ${snapshot.snapshotAt} · ${hours}시간 유효`,
);
