import { isRecord, PAST_RESULTS_LIMIT } from '@cheongyak-moa/contracts';
import type {
  AptResults,
  Environment,
  FetchJSON,
  MatchedNotice,
  Notice,
} from '@cheongyak-moa/contracts';
import { koreaToday, stage } from '@cheongyak-moa/domain';
import { getJSON } from './collectors.js';
import { assertNoSecrets } from './data-quality.js';
import type { Store } from './store.js';

const base = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1/';
const operations = {
  competition: 'getAPTLttotPblancCmpet',
  scores: 'getAptLttotPblancScore',
  special: 'getAPTSpsplyReqstStus',
} as const;

const specialTypes = [
  ['다자녀', 'MNYCH', 'MNYCH_HSHLDCO'],
  ['신혼부부', 'NWWDS_NMTW', 'NWWDS_NMTW_HSHLDCO'],
  ['생애최초', 'LFE_FRST', 'LFE_FRST_HSHLDCO'],
  ['청년', 'YGMN', 'YGMN_HSHLDCO'],
  ['노부모 부양', 'OPS', 'OLD_PARNTS_SUPORT_HSHLDCO'],
  ['신생아', 'NWBB_NWBBSHR', 'NWBB_NWBBSHR_HSHLDCO'],
] as const;

function field(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value)))
    throw new Error('청약 결과 항목 형식 오류');
  const text = String(value).trim();
  if (text.length > 80) throw new Error('청약 결과 항목 길이 오류');
  return text === '-' ? null : text || null;
}

function required(value: unknown): string {
  const text = field(value);
  if (text == null) throw new Error('청약 결과 식별 항목 누락');
  return text;
}

function region(row: Record<string, unknown>) {
  return field(row.RESIDE_SENM) ?? required(row.RESIDE_SECD);
}

function hasPublishedValues(result: AptResults) {
  return (
    result.competition.some((row) => row.applications != null || row.rate != null) ||
    result.scores.some((row) => row.low != null || row.high != null || row.average != null) ||
    result.special.some(
      (row) =>
        row.local != null ||
        row.otherGyeonggi != null ||
        row.other != null ||
        row.applications != null ||
        row.reserveApplications != null,
    )
  );
}

function normalize(
  competition: Record<string, unknown>[],
  scores: Record<string, unknown>[],
  special: Record<string, unknown>[],
): AptResults {
  return {
    checkedAt: new Date().toISOString(),
    competition: competition.map((row) => ({
      model: required(row.MODEL_NO),
      housingType: required(row.HOUSE_TY),
      rank: field(row.SUBSCRPT_RANK_CODE),
      region: region(row),
      units: field(row.SUPLY_HSHLDCO),
      applications: field(row.REQ_CNT),
      rate: field(row.CMPET_RATE),
    })),
    scores: scores.map((row) => ({
      model: required(row.MODEL_NO),
      housingType: required(row.HOUSE_TY),
      region: region(row),
      low: field(row.LWET_SCORE),
      high: field(row.TOP_SCORE),
      average: field(row.AVRG_SCORE),
    })),
    special: special.flatMap((row) => {
      const housingType = required(row.HOUSE_TY);
      const rows: AptResults['special'] = specialTypes.map(([category, prefix, units]) => ({
        housingType,
        category,
        units: field(row[units]),
        local: field(row[`CRSPAREA_${prefix}_CNT`]),
        otherGyeonggi: field(row[`CTPRVN_${prefix}_CNT`]),
        other: field(row[`ETC_AREA_${prefix}_CNT`]),
        applications: null,
        reserveApplications: null,
      }));
      rows.push(
        {
          housingType,
          category: '기관추천',
          units: field(row.INSTT_RECOMEND_HSHLDCO),
          local: null,
          otherGyeonggi: null,
          other: null,
          applications: field(row.INSTT_RECOMEND_DCSN_CNT),
          reserveApplications: field(row.INSTT_RECOMEND_PREPAR_CNT),
        },
        {
          housingType,
          category: '이전기관',
          units: field(row.TRANSR_INSTT_ENFSN_HSHLDCO),
          local: null,
          otherGyeonggi: null,
          other: null,
          applications: field(row.TRANSR_INSTT_ENFSN_CNT),
          reserveApplications: null,
        },
      );
      return rows.filter(
        ({ units, local, otherGyeonggi, other, applications, reserveApplications }) =>
          [units, local, otherGyeonggi, other, applications, reserveApplications].some(
            (v) => v != null && v !== '0',
          ),
      );
    }),
  };
}

async function fetchRows(
  operation: string,
  house: string,
  announcement: string,
  key: string,
  fetchFn: FetchJSON,
) {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  for (let page = 1; page <= 20; page++) {
    const url = new URL(base + operation);
    url.search = new URLSearchParams({
      serviceKey: key,
      page: String(page),
      perPage: '100',
      'cond[HOUSE_MANAGE_NO::EQ]': house,
      'cond[PBLANC_NO::EQ]': announcement,
    }).toString();
    const data = await getJSON(url, fetchFn);
    if (!isRecord(data) || !Array.isArray(data.data) || data.data.length > 100)
      throw new Error('청약 결과 목록 형식 오류');
    assertNoSecrets(data);
    if (data.matchCount != null) {
      const count = Number(data.matchCount);
      if (!Number.isSafeInteger(count) || count < 0 || (total != null && total !== count))
        throw new Error('청약 결과 전체 건수 불일치');
      total = count;
    }
    if (data.currentCount != null && Number(data.currentCount) !== data.data.length)
      throw new Error('청약 결과 페이지 건수 불일치');
    for (const row of data.data) {
      if (
        !isRecord(row) ||
        required(row.HOUSE_MANAGE_NO) !== house ||
        required(row.PBLANC_NO) !== announcement
      )
        throw new Error('청약 결과 공고번호 불일치');
      const identity = JSON.stringify([
        field(row.MODEL_NO),
        required(row.HOUSE_TY),
        field(row.RESIDE_SECD),
        field(row.SUBSCRPT_RANK_CODE),
      ]);
      if (seen.has(identity)) throw new Error('청약 결과 중복');
      seen.add(identity);
      rows.push(row);
    }
    if (total != null && rows.length > total) throw new Error('청약 결과 전체 건수 초과');
    if (data.data.length < 100 || rows.length === total) {
      if (total != null && rows.length !== total) throw new Error('청약 결과 페이지 누락');
      return rows;
    }
  }
  throw new Error('청약 결과 페이지 한도');
}

export function wasPublishedApt(notice: Notice, today: string) {
  return (
    notice.sourceId === 'applyhome' &&
    notice.operation === 'getAPTLttotPblancDetail' &&
    !notice.isDemo &&
    !notice.withdrawnFromProvider &&
    stage(notice, today) === 'closed' &&
    !!notice.winnerDate &&
    notice.winnerDate <= today
  );
}

function newestWinnerDate(a: Notice, b: Notice) {
  return (b.winnerDate ?? '').localeCompare(a.winnerDate ?? '') || a.id.localeCompare(b.id);
}

export function pastAptResults(notices: MatchedNotice[], today: string) {
  return notices
    .filter((notice) => notice.aptResults && wasPublishedApt(notice, today))
    .sort(newestWinnerDate)
    .slice(0, PAST_RESULTS_LIMIT);
}

export async function collectAptResults(
  store: Store,
  {
    env = process.env,
    fetchFn = fetch,
    today = koreaToday(),
  }: {
    env?: Environment;
    fetchFn?: FetchJSON;
    today?: string;
  } = {},
) {
  let key = env.APPLYHOME_RESULTS_SERVICE_KEY?.trim();
  if (!key) throw new Error('청약홈 경쟁률 API 인증키가 설정되지 않았습니다.');
  try {
    key = decodeURIComponent(key);
  } catch {
    /* 일반 인증키 그대로 사용 */
  }
  const candidates = store
    .all()
    .filter((n) => wasPublishedApt(n, today))
    .sort(newestWinnerDate)
    .slice(0, PAST_RESULTS_LIMIT);
  const run = store.beginRun('applyhome');
  let updated = 0,
    empty = 0,
    failed = 0;
  for (const notice of candidates) {
    try {
      const [house, announcement, extra] = notice.externalId.split(':');
      if (extra != null || !/^\d+$/.test(house) || !/^\d+$/.test(announcement ?? ''))
        throw new Error('청약 결과 요청 공고번호 오류');
      const competition = await fetchRows(
        operations.competition,
        house,
        announcement,
        key,
        fetchFn,
      );
      const scores = await fetchRows(operations.scores, house, announcement, key, fetchFn);
      const special = await fetchRows(operations.special, house, announcement, key, fetchFn);
      const result = normalize(competition, scores, special);
      if (!hasPublishedValues(result)) {
        empty++;
        continue;
      }
      const current = store.get(notice.id);
      if (!current || !wasPublishedApt(current, today)) throw new Error('공고가 변경되었습니다.');
      const { updatedAt, lastSeenAt, favorite, version, ...body } = current;
      const previous = current.aptResults;
      // 응답이 비어 있는 결과 유형의 이전 공개 자료는 유지합니다.
      const aptResults = {
        checkedAt: result.checkedAt,
        competition: result.competition.length ? result.competition : (previous?.competition ?? []),
        scores: result.scores.length ? result.scores : (previous?.scores ?? []),
        special: result.special.length ? result.special : (previous?.special ?? []),
      };
      if (
        !previous ||
        JSON.stringify([previous.competition, previous.scores, previous.special]) !==
          JSON.stringify([aptResults.competition, aptResults.scores, aptResults.special])
      )
        store.upsert({ ...body, aptResults });
      updated++;
    } catch (error) {
      failed++;
      if (
        isRecord(error) &&
        ['authentication', 'network_denied', 'timeout'].includes(String(error.publicCode))
      )
        break;
    }
  }
  const unqueried = candidates.length - updated - failed - empty;
  const message = `청약홈 APT 결과 · 반영 ${updated}건 · 미제공 ${empty}건 · 실패 ${failed}건 · 미조회 ${unqueried}건`;
  store.finishRun(run, failed ? 'failed' : 'success', updated, message);
  return { updated, empty, failed, unqueried, message };
}
