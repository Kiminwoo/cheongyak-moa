import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { previewData } from '../preview.js';
import { previewHash } from '../preview-http.js';
import { projectRoot, dataPaths } from '../paths.js';
import { writePreviewPackage } from '../core/preview-package.js';

const root = projectRoot(import.meta.url);
const hours = Number(process.env.PREVIEW_HOURS || 8);
if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
  throw new Error('공유 유효 시간은 0 초과 24시간 이하여야 합니다.');
const db = new DatabaseSync(dataPaths(root).database, { readOnly: true });
let snapshot;
try {
  snapshot = { ...previewData(db), snapshotAt: new Date().toISOString() };
} finally {
  db.close();
}
if (!snapshot.notices.length)
  throw new Error('공유할 실제 공고가 없습니다. 로컬에서 공고 수집을 먼저 실행해 주세요.');
const password = randomBytes(24).toString('base64url');
const expiresAt = Date.now() + hours * 3600000;
const fn = writePreviewPackage(
  root,
  snapshot,
  previewHash('Basic ' + Buffer.from('preview:' + password).toString('base64')),
  expiresAt,
);
// The deployable directory contains a verifier hash, never the plaintext password.
const accessFile = join(root, 'data', 'vercel-preview-access.txt');
writeFileSync(
  accessFile,
  `사용자 이름: preview\n비밀번호: ${password}\n만료: ${new Date(expiresAt).toISOString()}\n공고 사본 생성: ${snapshot.snapshotAt}\n`,
  { mode: 0o600 },
);
// Refuse artifacts accidentally containing credentials from the process environment.
for (const file of ['notices.json', 'index.mjs']) {
  const bytes = readFileSync(join(fn, file));
  for (const [key, value] of Object.entries(process.env))
    if (/SERVICE_KEY/.test(key) && value && bytes.includes(Buffer.from(value)))
      throw new Error('배포 자료에서 비밀정보가 발견됐습니다.');
}
console.log(
  `Vercel 조회 전용 배포 파일 준비 완료 · 실제 공고 ${snapshot.notices.length}건 · ${hours}시간 유효`,
);
console.log(`인증 정보: ${accessFile} (비밀번호는 채팅이나 Git에 올리지 마세요.)`);
console.log('배포 명령: npx.cmd vercel deploy --prebuilt');
