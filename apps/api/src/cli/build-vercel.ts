import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../paths.js';
import { decodeSnapshot } from '../core/public-snapshot.js';
import { writePreviewPackage } from '../core/preview-package.js';
const root = projectRoot(import.meta.url);
const snapshot = decodeSnapshot(
  readFileSync(join(root, 'apps', 'api', 'snapshots', 'public-notices.snapshot.json'), 'utf8'),
);
writePreviewPackage(root, snapshot, { publicReadOnly: true });
console.log(
  `Vercel Git 빌드 완료 · 공개 공고 ${snapshot.notices.length}건 · 사본 ${snapshot.snapshotAt} · 비밀번호 없는 조회 전용`,
);
