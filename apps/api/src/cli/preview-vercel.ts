import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { previewData } from '../preview.js';
import { projectRoot, dataPaths } from '../paths.js';
import { writePreviewPackage } from '../core/preview-package.js';

const root = projectRoot(import.meta.url);
const db = new DatabaseSync(dataPaths(root).database, { readOnly: true });
let snapshot;
try {
  snapshot = { ...previewData(db), snapshotAt: new Date().toISOString() };
} finally {
  db.close();
}
if (!snapshot.notices.length)
  throw new Error('공유할 실제 공고가 없습니다. 로컬에서 공고 수집을 먼저 실행해 주세요.');
const fn = writePreviewPackage(root, snapshot, { publicReadOnly: true });
// Refuse artifacts accidentally containing credentials from the process environment.
for (const file of ['notices.json', 'index.mjs']) {
  const bytes = readFileSync(join(fn, file));
  for (const [key, value] of Object.entries(process.env))
    if (/SERVICE_KEY/.test(key) && value && bytes.includes(Buffer.from(value)))
      throw new Error('배포 자료에서 비밀정보가 발견됐습니다.');
}
console.log(
  `Vercel 조회 전용 배포 파일 준비 완료 · 실제 공고 ${snapshot.notices.length}건 · 비밀번호 없이 공개`,
);
console.log('배포 명령: npx.cmd vercel deploy --prebuilt');
