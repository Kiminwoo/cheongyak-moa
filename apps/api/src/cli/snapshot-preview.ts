import { DatabaseSync } from 'node:sqlite';
import { projectRoot, dataPaths } from '../paths.js';
import { exportPublicSnapshot } from '../core/snapshot-export.js';
const root = projectRoot(import.meta.url);
const db = new DatabaseSync(dataPaths(root).database, { readOnly: true });
try {
  const snapshot = exportPublicSnapshot(db, root);
  console.log(
    `Git 배포용 공개 공고 사본 저장 · ${snapshot.notices.length}건 · 개인 조건·관심·인증 정보 제외`,
  );
} finally {
  db.close();
}
