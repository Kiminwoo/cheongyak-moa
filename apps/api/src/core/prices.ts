import { isRecord } from '@cheongyak-moa/contracts';
import type { FetchJSON, Notice, SupplyPrice, Environment } from '@cheongyak-moa/contracts';
import type { Store } from './store.js';
import { HOME_BASE } from './normalization.js';
import { getJSON } from './collectors.js';
import { saveRaw } from './ingestion.js';
import { inspectNotice, assertNoSecrets } from './data-quality.js';

export const PRICE_OPERATIONS: Record<string, { operation: string; amount: string }> = {
  getAPTLttotPblancDetail: { operation: 'getAPTLttotPblancMdl', amount: 'LTTOT_TOP_AMOUNT' },
  getRemndrLttotPblancDetail: { operation: 'getRemndrLttotPblancMdl', amount: 'LTTOT_TOP_AMOUNT' },
  getUrbtyOfctlLttotPblancDetail: {
    operation: 'getUrbtyOfctlLttotPblancMdl',
    amount: 'SUPLY_AMOUNT',
  },
};

function scalar(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new Error('주택형 항목 형식 오류');
  return String(value).trim();
}
function nonnegative(value: unknown): number | null {
  const raw = scalar(value);
  if (!raw || raw === '-') return null;
  if (raw.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw))
    throw new Error('금액 쉼표 형식 오류');
  const text = raw.replaceAll(',', '');
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('공급 금액 또는 세대수 형식 오류');
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) throw new Error('공급 금액 범위 오류');
  return number;
}
export function normalizePrices(notice: Notice, rows: unknown[]): SupplyPrice[] {
  const spec = PRICE_OPERATIONS[notice.operation ?? ''];
  if (!spec || notice.sourceId !== 'applyhome' || notice.type === 'rental')
    throw new Error('지원하지 않는 가격 유형');
  const [house, announcement] = notice.externalId.split(':');
  if (!/^\d+$/.test(house ?? '') || !/^\d+$/.test(announcement ?? ''))
    throw new Error('공고번호 형식 오류');
  const models = new Map<string, SupplyPrice>();
  assertNoSecrets(rows);
  for (const row of rows) {
    if (
      !isRecord(row) ||
      scalar(row.HOUSE_MANAGE_NO) !== house ||
      scalar(row.PBLANC_NO) !== announcement
    )
      throw new Error('가격 응답 공고번호 불일치');
    const model = scalar(row.MODEL_NO);
    const housingType =
      scalar(row.HOUSE_TY) || [scalar(row.GP), scalar(row.TP)].filter(Boolean).join(' · ');
    if (!model || !housingType) throw new Error('주택형 식별자 누락');
    if (!Object.hasOwn(row, spec.amount)) throw new Error('공급 금액 항목 누락');
    const amount = nonnegative(row[spec.amount]);
    const maximumWon = amount == null || amount === 0 ? null : amount * 10000;
    if (maximumWon != null && !Number.isSafeInteger(maximumWon))
      throw new Error('공급 금액 정밀도 오류');
    const units = nonnegative(row.SUPLY_HSHLDCO);
    if (units != null && !Number.isInteger(units)) throw new Error('공급 세대수 형식 오류');
    const item = {
      model,
      housingType,
      supplyArea: scalar(row.SUPLY_AR) || null,
      units,
      maximumWon,
    };
    const prior = models.get(model);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item))
      throw new Error('주택형 중복 충돌');
    models.set(model, item);
  }
  return [...models.values()].sort((a, b) => a.model.localeCompare(b.model));
}
export function applyPrices(notice: Notice, models: SupplyPrice[]): Notice {
  const updated: Notice = {
    ...notice,
    pricing: {
      operation: PRICE_OPERATIONS[notice.operation ?? ''].operation,
      basis: 'model-maximum',
      models,
    },
    priceBasis: '청약홈 주택형별 공급 최고금액 · 만원→원 환산 · 층별 실제가격·옵션 별도 확인',
  };
  updated.quality = inspectNotice(updated);
  return updated;
}

export async function collectPrices(
  store: Store,
  {
    env = process.env,
    fetchFn = fetch,
    rawDir = 'data/raw',
  }: { env?: Environment; fetchFn?: FetchJSON; rawDir?: string } = {},
) {
  if (!env.APPLYHOME_SERVICE_KEY?.trim()) throw new Error('청약홈 인증키가 설정되지 않았습니다.');
  let key = env.APPLYHOME_SERVICE_KEY.trim();
  try {
    key = decodeURIComponent(key);
  } catch {
    /* Decoding 키는 그대로 사용합니다. */
  }
  const candidates = store
    .all()
    .filter(
      (notice) =>
        !notice.isDemo &&
        notice.sourceId === 'applyhome' &&
        notice.type !== 'rental' &&
        PRICE_OPERATIONS[notice.operation ?? ''],
    );
  const run = store.beginRun('applyhome', 'api');
  let updated = 0,
    empty = 0,
    failed = 0;
  let failureCode = '';
  for (const notice of candidates) {
    try {
      const spec = PRICE_OPERATIONS[notice.operation ?? ''];
      const [house, announcement] = notice.externalId.split(':');
      if (!/^\d+$/.test(house ?? '') || !/^\d+$/.test(announcement ?? ''))
        throw new Error('공고번호 형식 오류');
      const rows: unknown[] = [];
      let complete = false;
      let expectedTotal: number | undefined;
      const seen = new Set<string>();
      for (let page = 1; page <= 20; page++) {
        const url = new URL(HOME_BASE + spec.operation);
        for (const [name, value] of Object.entries({
          serviceKey: key,
          page: String(page),
          perPage: '100',
          'cond[HOUSE_MANAGE_NO::EQ]': house,
          'cond[PBLANC_NO::EQ]': announcement,
        }))
          url.searchParams.set(name, value);
        const payload = await getJSON(url, fetchFn);
        if (!isRecord(payload) || !Array.isArray(payload.data))
          throw new Error('가격 응답 배열 누락');
        const fingerprint = JSON.stringify(payload.data);
        if (payload.data.length && seen.has(fingerprint)) throw new Error('가격 페이지 반복');
        seen.add(fingerprint);
        normalizePrices(notice, payload.data);
        saveRaw(rawDir, 'applyhome-prices', run, `${house}-${announcement}-${page}`, payload);
        rows.push(...payload.data);
        const total = Number(payload.matchCount ?? payload.totalCount);
        if (Number.isFinite(total)) {
          if (
            !Number.isInteger(total) ||
            total < rows.length ||
            (expectedTotal != null && expectedTotal !== total)
          )
            throw new Error('가격 전체 건수 불일치');
          expectedTotal = total;
          if (payload.data.length < 100 && rows.length !== total)
            throw new Error('가격 응답 일부 누락');
        }
        if (payload.data.length < 100 || (Number.isFinite(total) && page * 100 >= total)) {
          complete = true;
          break;
        }
      }
      if (!complete) throw new Error('가격 페이지 제한');
      const models = normalizePrices(notice, rows);
      if (!models.length || !models.some((model) => model.maximumWon != null)) {
        empty++;
        continue;
      }
      // 현행 사용자 관심 상태·다른 수집 결과를 덮지 않고 공고 본문만 갱신합니다.
      const current = store.get(notice.id);
      if (!current) throw new Error('공고가 삭제되었습니다.');
      const { updatedAt, lastSeenAt, favorite, version, ...body } = current;
      store.upsert(applyPrices(body, models));
      updated++;
    } catch (error) {
      failed++;
      failureCode = isRecord(error)
        ? String(error.publicCode ?? 'invalid_response')
        : 'invalid_response';
      // 인증·네트워크 장애는 나머지 공고에 동일 요청을 반복하지 않습니다.
      if (
        isRecord(error) &&
        ['authentication', 'network_denied', 'timeout'].includes(String(error.publicCode))
      )
        break;
    }
  }
  const unqueried = candidates.length - updated - empty - failed;
  const reason =
    failureCode === 'network_denied'
      ? ' 실행 환경의 API 접속 차단.'
      : failureCode === 'authentication'
        ? ' API 인증·승인 상태 확인 필요.'
        : failureCode === 'timeout'
          ? ' API 연결 지연·실패.'
          : '';
  const message = `가격 조회 ${updated}건 반영 · 미제공 ${empty}건 · 실패 ${failed}건 · 미조회 ${unqueried}건 · 대상 ${candidates.length}건.${reason} 실패·미제공 공고의 기존 가격은 유지됩니다.`;
  store.finishRun(run, failed ? 'failed' : 'success', updated, message);
  return { updated, empty, failed, unqueried, total: candidates.length, message };
}
