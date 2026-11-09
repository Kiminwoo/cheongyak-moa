import { COVERAGE_UNITS } from './coverage.js';
import { isRecord, errorCode } from '@cheongyak-moa/contracts';
import type { Environment, Notice, CollectionResult, FetchJSON } from '@cheongyak-moa/contracts';
import type { Store } from './store.js';
import { createHash } from 'node:crypto';
import { koreaToday, isActiveNotice } from '@cheongyak-moa/domain';
import { HOME_BASE, HOME_OPERATIONS, IMPORT_FORMATS, lhRows } from './normalization.js';
import { collectionConfig } from './config.js';
import { preparePayload, saveRaw } from './ingestion.js';
import { inspectNotice } from './data-quality.js';
export { HOME_OPERATIONS, normalizeHome, normalizeLH, lhRows } from './normalization.js';

function keyValue(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}
const failureMessages: Record<string, string> = {
  network_denied: '실행 환경에서 공식 API 접속이 차단되었습니다. 네트워크 권한을 확인해 주세요.',
  authentication: '공식 API 인증·활용 승인 상태를 확인해 주세요.',
  invalid_response: '공식 API 응답 형식 또는 날짜·페이지 구성을 확인해 주세요.',
  timeout: '공식 API 응답 지연 또는 연결 실패입니다. 잠시 후 다시 시도해 주세요.',
  page_limit: '페이지 한도에 도달했습니다. 기간을 나누거나 COLLECT_MAX_PAGES 설정을 확인해 주세요.',
};

export async function getJSON(url: URL, fetchFn: FetchJSON = fetch): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchFn(url, {
        signal: AbortSignal.timeout(20000),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        if ((response.status ?? 0) < 500 && response.status !== 429)
          throw Object.assign(
            new Error('공식 API 인증·승인 상태 또는 요청 명세를 확인해 주세요.'),
            { stop: true, publicCode: 'authentication' },
          );
        throw new Error('upstream');
      }
      try {
        return await response.json();
      } catch {
        throw Object.assign(new Error('공식 API가 JSON을 반환하지 않았습니다.'), {
          stop: true,
          publicCode: 'invalid_response',
        });
      }
    } catch (error) {
      if (isRecord(error) && error.stop) throw error;
      if (attempt === 2)
        throw Object.assign(new Error('공식 API 응답 실패'), {
          publicCode: ['EACCES', 'EPERM'].includes(
            errorCode(isRecord(error) ? error.cause : undefined) || errorCode(error),
          )
            ? 'network_denied'
            : 'timeout',
        });
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
}

function checkPage(rows: unknown[], fingerprints: Set<string>) {
  if (!rows.length) return;
  const fingerprint = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  if (fingerprints.has(fingerprint))
    throw new Error('공식 API가 같은 페이지를 반복해서 반환했습니다. 기존 데이터는 유지됩니다.');
  fingerprints.add(fingerprint);
}
function stageNotices(staged: Map<string, Notice>, notices: Notice[]) {
  for (const notice of notices) {
    const existing = staged.get(notice.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(notice))
      throw new Error('공식 API 수집 중 같은 공고의 내용이 달라졌습니다. 다시 시도해 주세요.');
    staged.set(notice.id, notice);
  }
}

export async function collect(
  store: Store,
  {
    env = process.env,
    rawDir = 'data/raw',
    fetchFn = fetch,
    today = koreaToday(),
    onlyFailed = false,
    allDates = false,
  }: {
    env?: Environment;
    rawDir?: string;
    fetchFn?: FetchJSON;
    today?: string;
    onlyFailed?: boolean;
    allDates?: boolean;
  } = {},
): Promise<CollectionResult[]> {
  const config = collectionConfig(env, today);
  const maxPages = Number(env.COLLECT_MAX_PAGES || 1000);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000)
    throw new Error('COLLECT_MAX_PAGES는 1~1000 사이여야 합니다.');
  const results: CollectionResult[] = [];
  for (const source of ['applyhome', 'lh'] as const) {
    const units = COVERAGE_UNITS.filter(
      (spec) =>
        spec.sourceId === source &&
        spec.channel === 'api' &&
        (!onlyFailed ||
          store
            .coverage()
            .some(
              (old) => old.sourceId === source && old.unit === spec.unit && old.status === 'failed',
            )),
    );
    if (!units.length) continue;
    if (!config.configured[source]) {
      results.push({ source, status: 'unconfigured', count: 0, message: '인증키 미설정' });
      continue;
    }
    const key = keyValue(
      env[source === 'applyhome' ? 'APPLYHOME_SERVICE_KEY' : 'LH_SERVICE_KEY'] || '',
    );
    const run = store.beginRun(source, 'api');
    let total = 0,
      changes = 0,
      warnings = 0,
      failed = 0;
    const accepted = new Map<string, Notice>();
    const activeIds = new Set<string>();
    let lastCode = '';
    for (const unit of units) {
      const previous = store
        .coverage()
        .find((old) => old.sourceId === source && old.unit === unit.unit);
      const from = onlyFailed
        ? previous!.from
        : source === 'applyhome' && allDates
          ? null
          : config.from;
      const to = onlyFailed ? previous!.to : source === 'applyhome' && allDates ? null : config.to;
      store.beginUnit(unit, from, to);
      const staged = new Map<string, Notice>();
      let fetched = 0;
      try {
        const format =
          source === 'applyhome'
            ? IMPORT_FORMATS.find((f) => f.operation === unit.unit)!.id
            : 'lh-notices';
        const fingerprints = new Set<string>();
        let complete = false;
        let expectedTotal: number | undefined;
        for (let page = 1; page <= maxPages; page++) {
          const url = new URL(
            source === 'applyhome'
              ? HOME_BASE + unit.unit
              : 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1',
          );
          const params =
            source === 'applyhome'
              ? {
                  serviceKey: key,
                  page: String(page),
                  perPage: '100',
                  'cond[RCRIT_PBLANC_DE::GTE]': from ?? undefined,
                  'cond[RCRIT_PBLANC_DE::LTE]': to ?? undefined,
                }
              : {
                  ServiceKey: key,
                  PG_SZ: '100',
                  PAGE: String(page),
                  UPP_AIS_TP_CD: unit.unit,
                  PAN_NT_ST_DT: (from || config.from).replaceAll('-', '.'),
                  CLSG_DT: (to || config.to).replaceAll('-', '.'),
                };
          for (const [name, value] of Object.entries(params))
            if (value !== undefined) url.searchParams.set(name, value);
          const payload = await getJSON(url, fetchFn);
          let rows: unknown[];
          let normalizedPayload: unknown = payload;
          if (source === 'applyhome') {
            if (!isRecord(payload) || !Array.isArray(payload.data))
              throw new Error('공식 API 형식 오류');
            rows = payload.data;
            // matchCount is filtered; totalCount may describe the entire, unfiltered service.
            if (payload.matchCount != null) {
              const count = Number(payload.matchCount);
              if (
                !Number.isSafeInteger(count) ||
                count < 0 ||
                (expectedTotal != null && expectedTotal !== count)
              )
                throw new Error('수집 중 공고 전체 건수가 변경됐습니다.');
              expectedTotal = count;
            }
            if (payload.currentCount != null && Number(payload.currentCount) !== rows.length)
              throw new Error('페이지 건수 불일치');
          } else {
            const records = lhRows(payload);
            rows = records;
            normalizedPayload = [
              {
                dsList: records.map((row) => ({
                  ...row,
                  UPP_AIS_TP_CD: row.UPP_AIS_TP_CD ?? unit.unit,
                })),
              },
            ];
          }
          if (rows.length > 100) throw new Error('페이지 크기 초과');
          checkPage(rows, fingerprints);
          const prepared = preparePayload(format, normalizedPayload, 'api');
          stageNotices(staged, prepared.notices);
          saveRaw(rawDir, source, run, `${unit.unit}-${page}`, payload);
          fetched += rows.length;
          if (expectedTotal != null && fetched > expectedTotal) throw new Error('전체 건수 초과');
          if (rows.length < 100 || (expectedTotal != null && fetched === expectedTotal)) {
            if (expectedTotal != null && fetched !== expectedTotal)
              throw new Error('페이지 일부 누락');
            complete = true;
            break;
          }
        }
        if (!complete)
          throw Object.assign(new Error('페이지 제한 초과'), { publicCode: 'page_limit' });
        const normalized = [...staged.values()].map((notice) => {
          const existing = store.get(notice.id);
          if (!existing?.pricing || existing.type !== notice.type) return notice;
          const preserved = {
            ...notice,
            pricing: existing.pricing,
            priceBasis: existing.priceBasis,
          };
          return { ...preserved, quality: inspectNotice(preserved) };
        });
        const active = normalized.filter((notice) => isActiveNotice(notice, today));
        for (const notice of normalized) {
          const previous = accepted.get(notice.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(notice))
            throw new Error('수집 유형 간 공고번호 충돌');
        }
        const terminalUpdates = normalized.filter(
          (notice) => !isActiveNotice(notice, today) && store.get(notice.id),
        );
        const unitChanges = store.transaction(() => {
          let count = 0;
          for (const notice of [...active, ...terminalUpdates])
            count += Number(store.writeNotice(notice));
          store.finishUnit(source, unit.unit, 'success', fetched, active.length);
          return count;
        });
        for (const notice of active) activeIds.add(notice.id);
        total = activeIds.size;
        for (const notice of normalized) accepted.set(notice.id, notice);
        changes += unitChanges;
        warnings += active.reduce((sum, n) => sum + (n.quality?.length ?? 0), 0);
      } catch (error) {
        const publicCode =
          isRecord(error) && typeof error.publicCode === 'string' ? error.publicCode : '';
        lastCode = Object.hasOwn(failureMessages, publicCode) ? publicCode : 'invalid_response';
        failed++;
        store.finishUnit(source, unit.unit, 'failed', fetched, 0, lastCode);
      }
    }
    const message =
      `유형별 조회 범위(현황 참고) · 유형 ${units.length - failed}/${units.length}개 성공 · 활성 ${total}건 · ${changes}건 신규·변경 · 원문 미검수` +
      (failed ? ` · 실패 ${failed}개 유형의 기존 공고 유지. ${failureMessages[lastCode]}` : '');
    const status = failed ? 'failed' : 'success';
    const code = failed ? (failed === units.length ? lastCode : 'partial_failure') : undefined;
    store.finishRun(run, status, total, message, warnings, code ?? null);
    results.push({
      source,
      status,
      count: total,
      changes,
      warnings,
      message,
      ...(code ? { code } : {}),
    });
  }
  return results;
}
