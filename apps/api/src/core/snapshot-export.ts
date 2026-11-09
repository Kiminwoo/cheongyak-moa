import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Environment } from '@cheongyak-moa/contracts';
import { previewData } from '../preview.js';
import { encodeSnapshot } from './public-snapshot.js';

export function exportPublicSnapshot(
  db: DatabaseSync,
  root: string,
  env: Environment = process.env,
) {
  const snapshot = { ...previewData(db), snapshotAt: new Date().toISOString() };
  const plain = JSON.stringify(snapshot);
  for (const [key, value] of Object.entries(env))
    if (/SERVICE_KEY|TOKEN|PASSWORD|SECRET/.test(key) && value && plain.includes(value))
      throw new Error('공고 사본에 비밀정보가 포함돼 있습니다.');
  const encoded = encodeSnapshot(snapshot);
  const folder = join(root, 'apps', 'api', 'snapshots');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, 'public-notices.snapshot.json');
  const temporary = target + `.tmp-${process.pid}`;
  let created = false;
  try {
    writeFileSync(temporary, encoded + '\n', { flag: 'wx' });
    created = true;
    renameSync(temporary, target);
  } finally {
    if (created) rmSync(temporary, { force: true });
  }
  return snapshot;
}
