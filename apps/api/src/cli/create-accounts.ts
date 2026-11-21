import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../paths.js';
import { generateTemporaryAccount, roles } from '../core/accounts.js';

const root = projectRoot(import.meta.url);
const expiresAt = Date.now() + 14 * 86400000;
const generated = roles.map((role) => generateTemporaryAccount(role, role, expiresAt));
const folder = join(root, 'data');
mkdirSync(folder, { recursive: true, mode: 0o700 });
const timestamp = new Date(expiresAt).toISOString().replace(/[:.]/g, '-');
const files = generated.map(({ account, password }) => ({
  file: join(folder, `temporary-${account.role}-${timestamp}.txt`),
  text: `Account: ${account.username}\nPassword: ${password}\nExpires: ${new Date(expiresAt).toISOString()}\n`,
}));
if (files.some(({ file }) => existsSync(file)))
  throw new Error('임시 로그인 정보 파일이 이미 있습니다.');
for (const { file, text } of files) writeFileSync(file, text, { flag: 'wx', mode: 0o600 });
writeFileSync(
  join(root, 'apps/api/src/core/temporary-accounts.json'),
  JSON.stringify(
    generated.map(({ account }) => account),
    null,
    2,
  ) + '\n',
);
console.log('임시 계정 정보가 Git 제외 경로 data/temporary-*.txt에 저장되었습니다.');
