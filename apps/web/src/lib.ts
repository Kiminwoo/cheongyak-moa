import { isRecord } from '@cheongyak-moa/contracts';
import type {
  MatchStatus,
  HousingType,
  NoticeStage,
  Filters,
  View,
  RequestOptions,
  MatchedNotice,
  Notice,
} from '@cheongyak-moa/contracts';
export interface CalendarCell {
  date: string;
  day: number;
  events: { n: MatchedNotice; label: string; end: boolean }[];
}
export const matchLabels: Record<MatchStatus, string> = {
  review: '공고 확인 필요',
  missing: '추가 입력 필요',
  ineligible: '예시 요건 미충족',
  'demo-match': '예시 조건 일치',
};
export const typeLabels: Record<HousingType, string> = {
  sale: '분양주택',
  rental: '임대주택',
  officetel: '오피스텔·기타',
};
export const stageLabels: Record<NoticeStage, string> = {
  open: '접수 중',
  upcoming: '접수 예정',
  closed: '접수 마감',
  unknown: '일정 확인 필요',
  cancelled: '취소',
};
export const defaultFilters: Filters = {
  search: '',
  region: '',
  type: '',
  dataMode: 'demo',
  includeClosed: false,
  status: '',
  sort: 'recommended',
};
export const viewCopy: Record<View, [string, string, string]> = {
  matching: [
    'OPPORTUNITIES FOR YOU',
    '나에게 맞는 청약 찾기',
    '조건에 맞는 이유와 확인할 내용을 함께 살펴보세요.',
  ],
  all: [
    'EXPLORE ALL',
    '여러 기관의 청약을 한곳에',
    '입력한 조건 밖의 공고도 숨기지 않고 함께 보여드려요.',
  ],
  favorites: [
    'YOUR COLLECTION',
    '마음에 담아둔 청약',
    '관심 공고를 모아 일정과 조건을 비교해 보세요.',
  ],
  calendar: [
    'PLAN YOUR NEXT STEP',
    '놓치지 않는 청약 일정',
    '접수 시작과 마감일을 달력에서 확인하세요.',
  ],
  sources: [
    'TRANSPARENT DATA',
    '데이터 연결 현황',
    '어디까지 모았는지, 무엇을 확인했는지 투명하게 안내해요.',
  ],
};
export async function request<T = unknown>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Local-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : '요청에 실패했습니다.',
    );
  return payload as T;
}
export function money(won: number | null | undefined): string {
  if (won == null) return '금액 미확인';
  const man = Math.round(won / 10000),
    eok = Math.floor(man / 10000),
    rest = man % 10000;
  return `${eok ? `${eok}억` : ''}${rest ? `${eok ? ' ' : ''}${rest.toLocaleString()}만` : ''}${man === 0 ? '0' : ''}원`;
}
export const shortDate = (value: string | null | undefined) =>
  value ? `${Number(value.slice(5, 7))}.${value.slice(8, 10)}` : '확인 필요';
export const dateTime = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '미수집';
export const daysTo = (date: string | null, today: string) =>
  date
    ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
    : null;
export function deadlineText(n: MatchedNotice, today: string) {
  if (n.match.stage === 'cancelled') return '취소 공고';
  if (n.match.stage === 'closed') return '접수 마감';
  const days = daysTo(n.deadline, today);
  return days === null ? '접수일 원문 확인' : days === 0 ? '오늘 마감 · 시간 확인' : `D-${days}`;
}
export function selectNotices(
  notices: MatchedNotice[],
  filters: Filters,
  view: View,
  { status = true }: { status?: boolean } = {},
) {
  return notices
    .filter((n) => {
      if (filters.dataMode === 'demo' && !n.isDemo) return false;
      if (filters.dataMode === 'live' && n.isDemo) return false;
      if (!filters.includeClosed && ['closed', 'cancelled'].includes(n.match.stage)) return false;
      if (filters.region && n.region !== filters.region && n.region !== '전국') return false;
      if (filters.type && n.type !== filters.type) return false;
      if (view === 'favorites' && !n.favorite) return false;
      if (status && filters.status && n.match.status !== filters.status) return false;
      return (
        !filters.search ||
        `${n.title} ${n.region} ${n.city} ${n.subtype} ${n.address} ${n.source}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      );
    })
    .sort((a, b) => {
      if (filters.sort === 'deadline')
        return (a.deadline || '9999').localeCompare(b.deadline || '9999');
      if (filters.sort === 'recent') return (b.announced || '').localeCompare(a.announced || '');
      return (
        (view === 'all' ? 0 : b.match.score - a.match.score) ||
        (a.deadline || '9999').localeCompare(b.deadline || '9999')
      );
    });
}
export function shiftMonth(month: string, offset: number) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
}
export function calendarCells(month: string, notices: MatchedNotice[]): (CalendarCell | null)[] {
  const [year, m] = month.split('-').map(Number),
    first = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(),
    length = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const cells: (CalendarCell | null)[] = Array.from({ length: first }, () => null);
  for (let day = 1; day <= length; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const events = notices.flatMap((n) => [
      ...(n.starts === date ? [{ n, label: '접수', end: false }] : []),
      ...(n.deadline === date ? [{ n, label: '마감', end: true }] : []),
    ]);
    cells.push({ date, day, events });
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function calendarFile(n: Notice, now = new Date()) {
  if (!n.starts || !n.deadline) throw new Error('확인된 접수 일정이 없습니다.');
  const after = new Date(`${n.deadline}T00:00:00Z`);
  after.setUTCDate(after.getUTCDate() + 1);
  const esc = (v: unknown) =>
    String(v)
      .replaceAll('\\', '\\\\')
      .replaceAll('\n', '\\n')
      .replaceAll(',', '\\,')
      .replaceAll(';', '\\;');
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CheongyakMoa//React PWA//KO',
    'BEGIN:VEVENT',
    `UID:${esc(n.id)}@cheongyak-moa.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${n.starts.replaceAll('-', '')}`,
    `DTEND;VALUE=DATE:${after.toISOString().slice(0, 10).replaceAll('-', '')}`,
    `SUMMARY:${esc(n.title)} 청약 접수${n.isDemo ? ' [가상 예시]' : ''}`,
    `DESCRIPTION:${esc('접수시간은 원문 확인. ' + n.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
export function downloadCalendar(n: Notice) {
  const url = URL.createObjectURL(
    new Blob([calendarFile(n)], { type: 'text/calendar;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = '청약일정.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
