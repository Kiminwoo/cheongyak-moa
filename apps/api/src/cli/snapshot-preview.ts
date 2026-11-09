import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot, dataPaths } from '../paths.js';
import { previewData } from '../preview.js';
import { encodeSnapshot } from '../core/public-snapshot.js';
const root = projectRoot(import.meta.url);
const db = new DatabaseSync(dataPaths(root).database, { readOnly: true });
try {
  const snapshot = { ...previewData(db), snapshotAt: new Date().toISOString() };
  const plain = JSON.stringify(snapshot);
  for (const [key, value] of Object.entries(process.env))
    if (/SERVICE_KEY|TOKEN|PASSWORD|SECRET/.test(key) && value && plain.includes(value))
      throw new Error('공고 사본에 비밀정보가 포함돼 있습니다.');
  const folder = join(root, 'apps', 'api', 'snapshots');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'public-notices.snapshot.json'), encodeSnapshot(snapshot) + '\n');
  console.log(
    `Git 배포용 공개 공고 사본 저장 · ${snapshot.notices.length}건 · 개인 조건·관심·인증 정보 제외`,
  );
} finally {
  db.close();
}
