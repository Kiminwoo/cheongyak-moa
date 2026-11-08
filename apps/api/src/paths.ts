import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
export function projectRoot(moduleUrl: string): string {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (directory !== parse(directory).root) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      const value: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
      if (value && typeof value === 'object' && 'name' in value && value.name === 'cheongyak-moa')
        return directory;
    }
    directory = dirname(directory);
  }
  throw new Error('프로젝트 루트를 찾을 수 없습니다. 루트에서 npm start를 실행해 주세요.');
}
