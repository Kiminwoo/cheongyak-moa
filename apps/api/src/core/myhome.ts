import { isRecord } from '@cheongyak-moa/contracts';
import type { ApiSource, Notice } from '@cheongyak-moa/contracts';
import { dateOnly, regionName } from '@cheongyak-moa/domain';

export const MYHOME_URL = 'https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList';
export const LOCAL_SOURCES = ['sh', 'gh', 'local'] as const;
export function myhomePage(payload: unknown): { rows: Record<string, unknown>[]; total: number } {
  if (!isRecord(payload)) throw new Error('마이홈 응답 객체가 없습니다.');
  const envelope = isRecord(payload.response) ? payload.response : payload;
  const header = envelope.header;
  if (!isRecord(header)) throw new Error('마이홈 응답 코드가 없습니다.');
  const code = String(header.resultCode);
  if (code !== '00' && code !== '03')
    throw Object.assign(new Error('마이홈 API 오류'), {
      publicCode: ['20', '21', '22', '30', '31', '32'].includes(code)
        ? 'authentication'
        : 'invalid_response',
    });
  const body = envelope.body;
  if (code === '03') {
    if (isRecord(body) && Number(body.totalCount ?? 0) !== 0)
      throw new Error('빈 응답 건수 불일치');
    if (isRecord(body)) {
      const item = body.item ?? (isRecord(body.items) ? body.items.item : undefined);
      if (Array.isArray(item) ? item.length > 0 : item != null && item !== '')
        throw new Error('빈 결과 코드와 공고 내용 불일치');
    }
    return { rows: [], total: 0 };
  }
  if (!isRecord(body)) throw new Error('마이홈 본문이 없습니다.');
  const total = Number(body.totalCount);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('마이홈 전체 건수 오류');
  const raw = body.item ?? (isRecord(body.items) ? body.items.item : undefined);
  const rows = raw == null || raw === '' ? [] : Array.isArray(raw) ? raw : [raw];
  if (!rows.every(isRecord) || total < rows.length || (total > 0 && !rows.length))
    throw new Error('마이홈 공고 배열 오류');
  return { rows, total };
}
function text(value: unknown): string {
  if (value == null) return '';
  if (!['string', 'number'].includes(typeof value)) throw new Error('마이홈 문자 항목 형식 오류');
  return String(value).trim();
}
function date(value: unknown): string | null {
  const input = text(value);
  if (!input || input === '-') return null;
  const parsed = dateOnly(input);
  if (!parsed) throw new Error('마이홈 접수일 형식 오류');
  return parsed;
}
export function issuerGroup(value: string): ApiSource | null {
  const name = value.replace(/[\s()㈜]/g, '');
  if (/한국토지주택공사|^LH$/i.test(name)) return 'lh';
  if (/서울주택도시(?:개발)?공사|^SH(?:공사)?$/i.test(name)) return 'sh';
  if (/경기주택도시공사|경기도시공사|^GH(?:공사)?$/i.test(name)) return 'gh';
  // 알 수 없는 민간 사업자나 빈 이름을 지방공사로 임의 분류하지 않습니다.
  if (/(?:도시|개발|주택)공사|(?:특별|광역)?(?:자치)?시청$|군청$|구청$|도청$/.test(name))
    return 'local';
  return null;
}
function officialLink(value: unknown, group: ApiSource): string | null {
  const input = text(value);
  if (!input) return null;
  try {
    const url = new URL(input);
    const host = url.hostname;
    const trusted =
      host === 'myhome.go.kr' ||
      host.endsWith('.myhome.go.kr') ||
      (group === 'sh' && (host === 'i-sh.co.kr' || host.endsWith('.i-sh.co.kr'))) ||
      (group === 'gh' && (host === 'gh.or.kr' || host.endsWith('.gh.or.kr'))) ||
      (group === 'local' && host.endsWith('.go.kr'));
    if (!trusted || url.protocol !== 'https:' || url.username || url.password) return null;
    if (/[?&](servicekey|service_key|api_key|access_token)=/i.test(url.search)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeMyhome(rows: Record<string, unknown>[]): {
  notices: Notice[];
  ignored: number;
} {
  const grouped = new Map<
    string,
    { notice: Notice; regions: Set<string>; addresses: Set<string>; dates: Set<string> }
  >();
  let ignored = 0;
  for (const row of rows) {
    const issuer = text(row.suplyInsttNm);
    if (!issuer) throw new Error('마이홈 공급기관명 누락');
    const group = issuerGroup(issuer);
    if (!group || group === 'lh') {
      ignored++;
      continue;
    }
    const externalId = text(row.pblancId);
    const title = text(row.pblancNm);
    if (!externalId || !/^[A-Za-z0-9_-]{1,100}$/.test(externalId) || !title)
      throw new Error('마이홈 필수 공고 식별정보 누락');
    const starts = date(row.beginDe),
      deadline = date(row.endDe);
    const region = regionName(text(row.brtcNm));
    const address =
      text(row.fullAdres) || [text(row.brtcNm), text(row.signguNm)].filter(Boolean).join(' ');
    const sourceUrl =
      officialLink(row.url, group) ||
      officialLink(row.pcUrl, group) ||
      `https://www.myhome.go.kr/hws/portal/sch/selectRsdtRcritNtcDetailView.do?pblancId=${encodeURIComponent(externalId)}`;
    const id = `myhome:${group}:${externalId}`;
    const notice: Notice = {
      id,
      externalId,
      sourceId: group,
      source: group === 'sh' ? 'SH' : group === 'gh' ? 'GH' : issuer,
      issuerName: issuer,
      provider: 'myhome',
      title,
      region,
      city: text(row.signguNm),
      address,
      type: 'rental',
      subtype: text(row.suplyTyNm) || '공공임대',
      isDemo: false,
      rulesComplete: false,
      rules: [],
      priceWon: null,
      depositWon: null,
      monthlyWon: null,
      area: null,
      areaBasis: null,
      priceBasis: '마이홈 목록 금액은 주택형·단위 대조 전 미확인',
      description:
        '마이홈 공공임대 API에서 수집한 공고입니다. 공급기관 자체 공고 전체를 의미하지 않습니다. 접수유형별 일정·금액·자격은 원문을 확인해 주세요.',
      announced: date(row.rcritPblancDe),
      starts,
      deadline,
      winnerDate: date(row.przwnerPresnatnDe),
      units: null,
      sourceUrl,
      cancelled: /취소/.test(text(row.sttusNm)),
      sourceStatus: text(row.sttusNm),
      schedules:
        starts || deadline
          ? [{ label: '마이홈 제공 모집 기간', start: starts, end: deadline }]
          : [],
      provenance: { method: 'api', reviewStatus: 'unverified' },
    };
    const previous = grouped.get(id);
    if (previous) {
      if (
        previous.notice.title !== title ||
        previous.notice.issuerName !== issuer ||
        previous.notice.announced !== notice.announced
      )
        throw new Error('마이홈 공고번호 내용 충돌');
      previous.regions.add(region);
      if (address) previous.addresses.add(address);
      previous.dates.add(JSON.stringify([starts, deadline]));
      previous.notice.cancelled ||= notice.cancelled;
    } else
      grouped.set(id, {
        notice,
        regions: new Set([region]),
        addresses: new Set(address ? [address] : []),
        dates: new Set([JSON.stringify([starts, deadline])]),
      });
  }
  return {
    ignored,
    notices: [...grouped.values()].map(({ notice, regions, addresses, dates }) => {
      const periods = [...dates].map(
        (value) => JSON.parse(value) as [string | null, string | null],
      );
      const ends = periods.map((period) => period[1]);
      const lastEnd = ends.every((end): end is string => end != null)
        ? (ends.sort().at(-1) ?? null)
        : null;
      return {
        ...notice,
        region: regions.size > 1 ? '전국' : notice.region,
        city: addresses.size > 1 ? '' : notice.city,
        address: addresses.size > 1 ? '복수 공급지역 · 공고 원문 확인' : notice.address,
        ...(dates.size > 1
          ? {
              starts: null,
              deadline: lastEnd,
              schedules: periods.map(([start, end], index) => ({
                label: `단지별 기간 ${index + 1}`,
                start,
                end,
              })),
              description: notice.description + ' 단지별 모집 기간이 달라 원문 확인이 필요합니다.',
            }
          : {}),
      };
    }),
  };
}
