import { errorCode } from '@cheongyak-moa/contracts';
import { copyFileSync, constants, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
export function initializeEnv(projectRoot: string) {
  const file = join(projectRoot, '.env');
  try {
    copyFileSync(join(projectRoot, '.env.example'), file, constants.COPYFILE_EXCL);
    return { created: true, message: '.env를 만들었습니다. 키를 로컬 파일에 입력한 뒤 서버를 재시작해 주세요.' };
  } catch (error) {
    if (errorCode(error) === 'EEXIST') return { created: false, message: '기존 .env는 변경하지 않았습니다. 설정 후 서버를 재시작해 주세요.' };
    throw new Error('.env 파일을 만들지 못했습니다. 프로젝트 폴더의 쓰기 권한을 확인해 주세요.');
  }
}
export function envFileStatus(projectRoot: string, startedAt: number) {
  const file = join(projectRoot, '.env');
  const exists = existsSync(file);
  return { exists, restartRequired: exists && statSync(file).mtimeMs > startedAt };
}
