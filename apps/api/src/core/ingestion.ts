import { isRecord } from '@cheongyak-moa/contracts';
import type { Notice, CollectionMethod, ImportInput, ImportResult } from '@cheongyak-moa/contracts';
import type { Store } from './store.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_OPERATIONS, IMPORT_FORMATS, normalizeHome, normalizeLH, lhRows } from './normalization.js';
import { assertNoSecrets, inspectNotice } from './data-quality.js';

export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;
export function preparePayload(format: string, payload: unknown, method: CollectionMethod = 'file-import') {
  const spec = IMPORT_FORMATS.find(f => f.id === format);
  if (!spec) throw new Error('지원하지 않는 응답 형식입니다.');
  assertNoSecrets(payload);
  const rows = spec.source === 'lh' ? lhRows(payload) : isRecord(payload) ? payload.data : undefined;
  if (!Array.isArray(rows)) throw new Error('공고 목록 배열이 없는 응답입니다.');
  if (rows.length > MAX_IMPORT_ROWS) throw new Error('한 번에 1,000개 이하의 공고만 가져올 수 있습니다.');
  const operation = HOME_OPERATIONS.find(o => o[0] === spec.operation);
  const notices = rows.map(row => {
    const notice = spec.source === 'lh' ? normalizeLH(row) : normalizeHome(row, ...operation!);
    notice.provenance = { method, reviewStatus: 'unverified' };
    notice.quality = inspectNotice(notice);
    if (notice.quality.some(issue => issue.severity === 'error')) throw new Error('공고의 필수 항목 또는 일정 순서가 잘못되었습니다. 기존 공고는 유지됩니다.');
    return notice;
  });
  const unique = new Map<string, Notice>();
  for (const notice of notices) {
    const previous = unique.get(notice.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(notice)) throw new Error('같은 공고번호에 서로 다른 내용이 있습니다.');
    unique.set(notice.id, notice);
  }
  return { spec, notices: [...unique.values()], warnings: [...unique.values()].reduce((sum, n) => sum + n.quality.length, 0) };
}
export function saveRaw(rawDir: string, source: string, runId: number, name: string, payload: unknown) {
  assertNoSecrets(payload);
  const folder = join(rawDir, source, String(runId));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${name}.json`), JSON.stringify(payload, null, 2));
}
export function importResponse(store: Store, { format, payload, rawDir }: ImportInput & {rawDir: string}): ImportResult {
  const spec = IMPORT_FORMATS.find(f => f.id === format);
  if (!spec) throw new Error('지원하지 않는 응답 형식입니다.');
  const run = store.beginRun(spec.source, 'file-import');
  try {
    const prepared = preparePayload(format, payload);
    saveRaw(rawDir, spec.source, run, 'import', payload);
    const changes = store.upsertBatch(prepared.notices);
    const message = `${prepared.notices.length}건 가져오기 · ${changes}건 신규·변경 · 원문 미검수`;
    store.finishRun(run, 'success', prepared.notices.length, message, prepared.warnings);
    return { count: prepared.notices.length, changes, warnings: prepared.warnings, method: 'file-import' };
  } catch (error) {
    store.finishRun(run, 'failed', 0, '응답 가져오기 실패. 형식·비밀정보 포함 여부·공고 일정을 확인해 주세요.');
    throw error;
  }
}
