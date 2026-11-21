import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isRecord, PAST_RESULTS_LIMIT } from '@cheongyak-moa/contracts';
import type { BootstrapData } from '@cheongyak-moa/contracts';
import { assertNoSecrets } from './data-quality.js';

export function assertPublicSnapshot(value: unknown): asserts value is BootstrapData {
  assertNoSecrets(value);
  if (
    !isRecord(value) ||
    value.readOnly !== true ||
    !isRecord(value.profile) ||
    Object.keys(value.profile).length ||
    !Array.isArray(value.runs) ||
    value.runs.length ||
    value.collecting !== false ||
    !Array.isArray(value.notices) ||
    !value.notices.length ||
    typeof value.snapshotAt !== 'string' ||
    !Number.isFinite(Date.parse(value.snapshotAt))
  )
    throw new Error('개인 정보가 제외된 공개 공고 사본이 필요합니다.');
  if (
    !isRecord(value.connection) ||
    !isRecord(value.connection.configured) ||
    Object.values(value.connection.configured).some(Boolean) ||
    !isRecord(value.connection.environment) ||
    value.connection.environment.exists !== false
  )
    throw new Error('공개 사본에 로컬 설정 상태를 포함할 수 없습니다.');
  const allowed = new Set([
    'readOnly',
    'snapshotAt',
    'profile',
    'notices',
    'pastResults',
    'regions',
    'today',
    'sources',
    'runs',
    'collecting',
    'connection',
    'quality',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error('공개 사본의 알 수 없는 최상위 항목');
  const pastResults = value.pastResults === undefined ? [] : value.pastResults;
  if (
    !Array.isArray(pastResults) ||
    pastResults.length > PAST_RESULTS_LIMIT ||
    pastResults.some(
      (n) =>
        !isRecord(n) ||
        n.sourceId !== 'applyhome' ||
        n.operation !== 'getAPTLttotPblancDetail' ||
        n.withdrawnFromProvider ||
        !isRecord(n.match) ||
        n.match.stage !== 'closed' ||
        !isRecord(n.aptResults),
    )
  )
    throw new Error('공개 사본에 유효한 청약홈 마감 결과가 필요합니다.');
  for (const notice of [...value.notices, ...pastResults]) {
    if (
      !isRecord(notice) ||
      notice.isDemo !== false ||
      notice.favorite !== false ||
      !isRecord(notice.match) ||
      !isRecord(notice.match.preference) ||
      notice.match.preference.state !== 'unset'
    )
      throw new Error('공고 사본에 개인 관심·선호 또는 예시 데이터를 포함할 수 없습니다.');
    const fields = new Set([
      'id',
      'sourceId',
      'externalId',
      'title',
      'source',
      'region',
      'city',
      'address',
      'type',
      'subtype',
      'isDemo',
      'rulesComplete',
      'rules',
      'priceWon',
      'depositWon',
      'monthlyWon',
      'area',
      'areaBasis',
      'priceBasis',
      'description',
      'starts',
      'deadline',
      'announced',
      'winnerDate',
      'units',
      'sourceUrl',
      'cancelled',
      'issuerName',
      'provider',
      'publicationDate',
      'pricing',
      'schedules',
      'quality',
      'provenance',
      'operation',
      'publicationEnd',
      'sourceStatus',
      'withdrawnFromProvider',
      'updatedAt',
      'lastSeenAt',
      'favorite',
      'version',
      'match',
      'aptResults',
    ]);
    if (Object.keys(notice).some((key) => !fields.has(key)))
      throw new Error('알 수 없는 공고 사본 항목');
  }
}

export function encodeSnapshot(snapshot: BootstrapData): string {
  assertPublicSnapshot(snapshot);
  const bytes = Buffer.from(JSON.stringify(snapshot));
  return JSON.stringify({
    schemaVersion: 1,
    encoding: 'gzip-base64',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    content: gzipSync(bytes).toString('base64'),
  });
}
export function decodeSnapshot(encoded: string): BootstrapData {
  const envelope: unknown = JSON.parse(encoded);
  if (
    !isRecord(envelope) ||
    envelope.schemaVersion !== 1 ||
    envelope.encoding !== 'gzip-base64' ||
    typeof envelope.content !== 'string' ||
    typeof envelope.sha256 !== 'string'
  )
    throw new Error('지원하지 않는 공고 사본 형식');
  const bytes = gunzipSync(Buffer.from(envelope.content, 'base64'), {
    maxOutputLength: 5 * 1024 * 1024,
  });
  if (createHash('sha256').update(bytes).digest('hex') !== envelope.sha256)
    throw new Error('공고 사본 무결성 오류');
  const snapshot: unknown = JSON.parse(bytes.toString('utf8'));
  assertPublicSnapshot(snapshot);
  return snapshot;
}
