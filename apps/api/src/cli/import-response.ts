import { errorCode, errorMessage } from '@cheongyak-moa/contracts';
import { projectRoot as findProjectRoot } from '../paths.js';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { Store } from '../core/store.js';
import { MAX_IMPORT_BYTES, preparePayload, importResponse } from '../core/ingestion.js';

const args = process.argv.slice(2);
const argument = (name: string) => args[args.indexOf(name) + 1];
let store: Store | undefined;
try {
  if (!args.includes('--file') || !args.includes('--format'))
    throw new Error(
      '사용법: npm run import:data -- --format applyhome-apt --file 응답.json [--dry-run]',
    );
  const file = resolve(argument('--file') || '');
  if (statSync(file).size > MAX_IMPORT_BYTES)
    throw new Error('응답 파일은 1MiB 이하만 가져올 수 있습니다.');
  const payload = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const format = argument('--format') || '';
  if (args.includes('--dry-run')) {
    const prepared = preparePayload(format, payload);
    console.log(
      `검증 완료: ${prepared.notices.length}건 · 확인 항목 ${prepared.warnings}개 · DB에 저장하지 않았습니다.`,
    );
  } else {
    const root = findProjectRoot(import.meta.url);
    store = new Store(join(root, 'data', 'cheongyak.sqlite'));
    const result = importResponse(store, { format, payload, rawDir: join(root, 'data', 'raw') });
    console.log(`${result.count}건 가져오기 · ${result.changes}건 신규·변경 · 원문 미검수`);
  }
} catch (error) {
  console.error(
    error instanceof SyntaxError
      ? 'JSON 파일 형식이 올바르지 않습니다.'
      : errorCode(error)
        ? '파일을 읽거나 저장할 수 없습니다. 경로와 권한을 확인해 주세요.'
        : errorMessage(error),
  );
  process.exitCode = 1;
} finally {
  store?.close();
}
