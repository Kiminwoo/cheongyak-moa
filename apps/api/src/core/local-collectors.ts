import { isRecord } from '@cheongyak-moa/contracts';
import type { Environment, FetchJSON, CollectionResult } from '@cheongyak-moa/contracts';
import { isActiveNotice, koreaToday } from '@cheongyak-moa/domain';
import type { Store } from './store.js';
import { myhomeKey } from './config.js';
import { getJSON } from './collectors.js';
import { MYHOME_URL, LOCAL_SOURCES, myhomePage, normalizeMyhome } from './myhome.js';
import { inspectNotice } from './data-quality.js';
import { saveRaw } from './ingestion.js';
import { boardIdentity } from './board-collectors.js';
import { COVERAGE_UNITS } from './coverage.js';

export async function collectLocal(
  store: Store,
  {
    env = process.env,
    fetchFn = fetch,
    rawDir = 'data/raw',
    today = koreaToday(),
    onlyFailed = false,
  }: {
    env?: Environment;
    fetchFn?: FetchJSON;
    rawDir?: string;
    today?: string;
    onlyFailed?: boolean;
  } = {},
): Promise<CollectionResult[]> {
  const selected = LOCAL_SOURCES.filter(
    (source) =>
      !onlyFailed ||
      store
        .coverage()
        .some(
          (unit) =>
            unit.sourceId === source && unit.unit === 'myhome-rental' && unit.status === 'failed',
        ),
  );
  if (!selected.length) return [];
  let key = myhomeKey(env);
  if (!key)
    return selected.map((source) => ({
      source,
      status: 'unconfigured',
      count: 0,
      message: '마이홈 모집공고 API 인증키·활용 승인 필요',
    }));
  try {
    key = decodeURIComponent(key);
  } catch {
    /* 일반 Decoding 키 유지 */
  }
  const runs = selected.map((source) => {
    store.beginUnit(
      COVERAGE_UNITS.find((unit) => unit.sourceId === source && unit.unit === 'myhome-rental')!,
    );
    return { source, id: store.beginRun(source) };
  });
  let fetched = 0;
  try {
    const rows: Record<string, unknown>[] = [];
    const fingerprints = new Set<string>();
    let expectedTotal: number | undefined;
    let complete = false;
    for (let page = 1; page <= 100; page++) {
      const url = new URL(MYHOME_URL);
      for (const [name, value] of Object.entries({
        serviceKey: key,
        pageNo: String(page),
        numOfRows: '100',
        _type: 'json',
      }))
        url.searchParams.set(name, value);
      const payload = await getJSON(url, fetchFn);
      const parsed = myhomePage(payload);
      if (expectedTotal != null && parsed.total !== expectedTotal)
        throw new Error('수집 중 전체 건수 변경');
      expectedTotal = parsed.total;
      const fingerprint = JSON.stringify(parsed.rows);
      if (parsed.rows.length && fingerprints.has(fingerprint))
        throw new Error('마이홈 페이지 반복');
      fingerprints.add(fingerprint);
      rows.push(...parsed.rows);
      fetched = rows.length;
      if (rows.length > parsed.total) throw new Error('마이홈 전체 건수 초과');
      saveRaw(rawDir, 'myhome', runs[0].id, `rent-${page}`, payload);
      if (rows.length === parsed.total) {
        complete = true;
        break;
      }
      if (!parsed.rows.length) throw new Error('마이홈 응답 일부 누락');
    }
    if (!complete) throw new Error('마이홈 페이지 제한');
    const prepared = normalizeMyhome(rows);
    const notices = prepared.notices
      .filter((notice) => selected.some((source) => source === notice.sourceId))
      .map((notice) => ({
        ...notice,
        quality: inspectNotice(notice),
      }));
    if (notices.some((notice) => notice.quality.some((issue) => issue.severity === 'error')))
      throw new Error('공고 필수 항목·접수 일정 오류');
    const active = notices.filter((notice) => isActiveNotice(notice, today));
    const terminal = notices.filter(
      (notice) => !isActiveNotice(notice, today) && store.get(notice.id),
    );
    const changes = new Map<string, number>();
    store.transaction(() => {
      for (const notice of [...active, ...terminal]) {
        const identity = boardIdentity(notice.sourceUrl, notice.sourceId);
        if (
          identity &&
          store
            .all()
            .some(
              (old) =>
                old.provenance?.method === 'web' &&
                boardIdentity(old.sourceUrl, old.sourceId) === identity,
            )
        )
          continue;
        changes.set(
          notice.sourceId,
          (changes.get(notice.sourceId) ?? 0) + Number(store.writeNotice(notice)),
        );
      }
      const present = new Set(notices.map((notice) => notice.id));
      // 현재 모집 목록 누락은 마감으로 단정하지 않고 서비스 노출만 중단합니다.
      for (const old of store.all())
        if (
          old.provider === 'myhome' &&
          selected.some((source) => source === old.sourceId) &&
          !present.has(old.id) &&
          !old.withdrawnFromProvider
        ) {
          const { updatedAt, lastSeenAt, favorite, version, ...body } = old;
          store.writeNotice({ ...body, withdrawnFromProvider: true });
        }
      for (const run of runs) {
        const subset = active.filter((notice) => notice.sourceId === run.source);
        store.finishUnit(run.source, 'myhome-rental', 'success', fetched, subset.length);
        const message = `마이홈 공공임대 목록 · ${subset.length}건 · ${changes.get(run.source) ?? 0}건 신규·변경 · LH/기관 미식별 ${prepared.ignored}행 제외. 해당 기관 자체 공고 전체를 뜻하지 않습니다.`;
        store.finishRun(
          run.id,
          'success',
          subset.length,
          message,
          subset.reduce((sum, notice) => sum + notice.quality.length, 0),
        );
      }
    });
    return runs.map((run) => ({
      source: run.source,
      status: 'success',
      count: active.filter((notice) => notice.sourceId === run.source).length,
      changes: changes.get(run.source) ?? 0,
      message: store.runs().find((item) => item.id === run.id)!.message!,
    }));
  } catch (error) {
    const code =
      isRecord(error) && typeof error.publicCode === 'string'
        ? error.publicCode
        : 'invalid_response';
    const message =
      code === 'authentication'
        ? '마이홈 모집공고 API(15108420)의 인증키·활용 승인 상태를 확인해 주세요. 기존 자료는 유지됩니다.'
        : code === 'network_denied'
          ? '실행 환경에서 마이홈 API 접속이 차단되었습니다. 기존 자료는 유지됩니다.'
          : '마이홈 응답 형식·페이지·공고 항목 검증에 실패했습니다. 기존 자료는 유지됩니다.';
    return runs.map((run) => {
      store.finishUnit(run.source, 'myhome-rental', 'failed', fetched, 0, code);
      store.finishRun(run.id, 'failed', 0, message, 0, code);
      return { source: run.source, status: 'failed', count: 0, code, message };
    });
  }
}
