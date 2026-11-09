import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createPreview } from '../preview.js';
import { projectRoot, dataPaths } from '../paths.js';

const root = projectRoot(import.meta.url);
const database = dataPaths(root).database;
const webDirectory = join(root, 'apps', 'web', 'dist');
const port = Number(process.env.PREVIEW_PORT || 4311);
const hours = Number(process.env.PREVIEW_HOURS || 8);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !Number.isFinite(hours) ||
  hours <= 0 ||
  hours > 24
)
  throw new Error('PREVIEW_PORT는 1024~65535, PREVIEW_HOURS는 0 초과 24 이하여야 합니다.');
if (!existsSync(database) || !existsSync(join(webDirectory, 'app.js')))
  throw new Error(
    '공고 DB와 화면 빌드가 필요합니다. 프로젝트 루트에서 npm run preview를 실행하세요.',
  );
const password = randomBytes(24).toString('base64url');
const expiresAt = Date.now() + hours * 3600000;
const accessFile = join(root, 'data', 'preview-access.txt');
const { server, close } = createPreview({ database, webDirectory, password, expiresAt });
server.on('error', () => {
  console.error('미리보기 서버를 실행하지 못했습니다. 포트 사용 상태를 확인해 주세요.');
  close();
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(
    accessFile,
    `사용자 이름: preview\n비밀번호: ${password}\n만료: ${new Date(expiresAt).toISOString()}\n외부에서는 HTTPS 공유 주소를 사용하세요.\n`,
    { mode: 0o600 },
  );
  console.log(`조회 전용 미리보기: http://127.0.0.1:${port}`);
  console.log(
    `인증 정보는 ${accessFile} 파일에서 확인하세요. 비밀번호를 채팅이나 Git에 올리지 마세요.`,
  );
  console.log(`공유 유효 시간: ${hours}시간. 서버를 재시작하면 비밀번호가 변경됩니다.`);
});
const stop = () => {
  server.closeAllConnections();
  server.close(() => {
    close();
    process.exit(0);
  });
};
const timer = setTimeout(stop, Math.max(1, expiresAt - Date.now()));
timer.unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
