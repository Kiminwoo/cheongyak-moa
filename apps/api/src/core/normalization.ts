import { isRecord } from '@cheongyak-moa/contracts';
import type { HousingType, ImportFormat, Schedule, Notice } from '@cheongyak-moa/contracts';
import { dateOnly, regionName } from '@cheongyak-moa/domain';

export const HOME_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/';
export const HOME_OPERATIONS: [string, HousingType, string][] = [
  ['getAPTLttotPblancDetail', 'sale', 'APT 분양'],
  ['getRemndrLttotPblancDetail', 'sale', '무순위·잔여세대'],
  ['getUrbtyOfctlLttotPblancDetail', 'officetel', '오피스텔·도시형·민간임대'],
];
export const IMPORT_FORMATS: ImportFormat[] = [
  {
    id: 'applyhome-apt',
    label: '청약홈 · APT 목록 응답',
    source: 'applyhome',
    operation: 'getAPTLttotPblancDetail',
  },
  {
    id: 'applyhome-remnant',
    label: '청약홈 · 잔여세대 목록 응답',
    source: 'applyhome',
    operation: 'getRemndrLttotPblancDetail',
  },
  {
    id: 'applyhome-other',
    label: '청약홈 · 오피스텔·도시형·민간임대 목록 응답',
    source: 'applyhome',
    operation: 'getUrbtyOfctlLttotPblancDetail',
  },
  { id: 'lh-notices', label: 'LH · 분양임대 공고 목록 응답', source: 'lh' },
];
const base = {
  isDemo: false,
  rules: [],
  rulesComplete: false,
  priceWon: null,
  depositWon: null,
  monthlyWon: null,
  area: null,
  areaBasis: null,
  priceBasis: '목록 API에는 확정 가격 없음 · 원문 확인',
  description:
    '공고 목록 자료입니다. 주택형별 가격·상세 접수시간·자격·정정사항은 공식 원문에서 확인해 주세요.',
};
function safeLink(value: unknown, domains: string[]): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      domains.some((d) => u.hostname === d || u.hostname.endsWith('.' + d))
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function text(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (!['string', 'number'].includes(typeof value))
    throw new Error('공고 문자 항목의 자료형이 예상과 다릅니다.');
  return String(value);
}
function units(value: unknown): number | null {
  const n = Number(String(value ?? '').replaceAll(',', ''));
  return value != null && value !== '' && Number.isInteger(n) && n >= 0 ? n : null;
}
function normalizedDate(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null;
  const parsed = dateOnly(value);
  if (!parsed) throw new Error('청약 공고 날짜 형식이 예상과 다릅니다. 응답 명세를 확인해 주세요.');
  return parsed;
}
function publicSchedule(label: string, startValue: unknown, endValue: unknown): Schedule | null {
  if (!startValue && !endValue) return null;
  return { label, start: normalizedDate(startValue), end: normalizedDate(endValue) };
}
export function normalizeHome(
  row: unknown,
  operation: string,
  type: HousingType,
  subtype: string,
): Notice {
  if (
    !isRecord(row) ||
    !row.HOUSE_MANAGE_NO ||
    !row.PBLANC_NO ||
    typeof row.HOUSE_NM !== 'string' ||
    !row.HOUSE_NM.trim()
  )
    throw new Error('청약홈 응답의 필수 식별자 또는 공고명이 없습니다.');
  text(row.HOUSE_MANAGE_NO);
  text(row.PBLANC_NO);
  const rental =
    [row.RENT_SECD_NM, row.HOUSE_SECD_NM].some((v) => String(v ?? '').includes('임대')) ||
    String(row.SEARCH_HOUSE_SECD) === '0203';
  const schedules = [
    publicSchedule('특별공급', row.SPSPLY_RCEPT_BGNDE, row.SPSPLY_RCEPT_ENDDE),
    publicSchedule('일반공급', row.GNRL_RCEPT_BGNDE, row.GNRL_RCEPT_ENDDE),
    publicSchedule(
      '전체 접수',
      row.RCEPT_BGNDE || row.SUBSCRPT_RCEPT_BGNDE,
      row.RCEPT_ENDDE || row.SUBSCRPT_RCEPT_ENDDE,
    ),
  ].filter((schedule): schedule is Schedule => schedule !== null);
  const starts = schedules
    .map((s) => s.start)
    .filter(Boolean)
    .sort();
  const ends = schedules
    .map((s) => s.end)
    .filter(Boolean)
    .sort();
  return {
    ...base,
    id: `applyhome:${operation}:${row.HOUSE_MANAGE_NO}:${row.PBLANC_NO}`,
    sourceId: 'applyhome',
    externalId: `${row.HOUSE_MANAGE_NO}:${row.PBLANC_NO}`,
    operation,
    title: row.HOUSE_NM,
    source: '청약홈',
    region: regionName(text(row.SUBSCRPT_AREA_CODE_NM || row.HSSPLY_ADRES)),
    city: '',
    address: text(row.HSSPLY_ADRES, '주소 미확인'),
    type: rental ? 'rental' : type,
    subtype: text(row.HOUSE_DTL_SECD_NM || row.HOUSE_SECD_NM || subtype),
    announced: normalizedDate(row.RCRIT_PBLANC_DE),
    starts: starts[0] || null,
    deadline: ends.at(-1) || null,
    schedules,
    winnerDate: normalizedDate(row.PRZWNER_PRESNATN_DE),
    units: units(row.TOT_SUPLY_HSHLDCO),
    sourceUrl: safeLink(row.PBLANC_URL, ['applyhome.co.kr', 'reb.or.kr']),
    cancelled: false,
  };
}
export function normalizeLH(row: unknown): Notice {
  if (!isRecord(row) || !row.PAN_NM || !row.DTL_URL)
    throw new Error('LH 응답의 공고명 또는 상세 URL이 없습니다.');
  const link = safeLink(row.DTL_URL, ['lh.or.kr']);
  if (!link) throw new Error('LH 상세 URL이 유효하지 않습니다.');
  let decoded;
  try {
    decoded = decodeURIComponent(link);
  } catch {
    throw new Error('LH 상세 URL의 인코딩이 유효하지 않습니다.');
  }
  const found = /PAN_ID[:=]([A-Za-z0-9_-]+)/.exec(decoded);
  const externalId = text(row.PAN_ID || found?.[1] || '');
  if (!externalId) throw new Error('LH 고유 공고번호를 확인할 수 없습니다.');
  const category = String(row.UPP_AIS_TP_CD ?? '');
  const name = String(row.UPP_AIS_TP_NM ?? '');
  if (category && !['05', '06', '13', '39'].includes(category))
    throw new Error('LH 주거용 공고 유형만 가져올 수 있습니다.');
  if (!category && !/주택|주거|임대|분양/.test(name))
    throw new Error('LH 주거용 공고 유형을 확인할 수 없습니다.');
  return {
    ...base,
    id: `lh:${externalId}`,
    sourceId: 'lh',
    externalId,
    title: text(row.PAN_NM),
    source: 'LH',
    region: regionName(text(row.CNP_CD_NM)),
    city: '',
    address: text(row.CNP_CD_NM, '지역 미확인'),
    type: ['05', '39'].includes(category) || name.includes('분양') ? 'sale' : 'rental',
    subtype: text(row.AIS_TP_CD_NM || row.UPP_AIS_TP_NM || '분양·임대'),
    announced: normalizedDate(row.PAN_NT_ST_DT || row.PAN_NT_DT),
    starts: null,
    deadline: null,
    schedules: [],
    winnerDate: null,
    units: null,
    sourceUrl: link,
    // 공고게시 종료일은 접수 마감일이 아닙니다.
    publicationEnd: normalizedDate(row.CLSG_DT),
    sourceStatus: row.PAN_SS == null ? null : text(row.PAN_SS),
    cancelled: String(row.PAN_SS).includes('취소'),
  };
}
export function lhRows(payload: unknown): Record<string, unknown>[] {
  const entries = Array.isArray(payload) ? payload : [payload];
  for (const entry of entries) {
    if (!isRecord(entry)) throw new Error('LH 응답 형식이 잘못되었습니다.');
    if (entry?.SS_CODE && entry.SS_CODE !== 'Y')
      throw new Error('LH API 오류 응답입니다. 인증·승인 상태를 확인해 주세요.');
    for (const info of Array.isArray(entry.dsSch) ? entry.dsSch : [])
      if (info.SS_CODE && info.SS_CODE !== 'Y') throw new Error('LH API 오류 응답입니다.');
  }
  const found = entries.find(
    (entry): entry is Record<string, unknown> & { dsList: unknown[] } =>
      isRecord(entry) && Array.isArray(entry.dsList),
  );
  if (!found) throw new Error('LH API 응답 형식이 예상과 다릅니다.');
  if (!found.dsList.every(isRecord)) throw new Error('LH 공고 항목이 잘못되었습니다.');
  return found.dsList;
}
