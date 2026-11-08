import { Window } from 'happy-dom';
import { dateOnly, regionName } from '@cheongyak-moa/domain';
import type { Notice, HousingType, Schedule } from '@cheongyak-moa/contracts';
import { boardURL, boardError, BOARD_SITES } from './board-http.js';
import type { BoardSource } from './board-http.js';

function documentFrom(html: string) {
  const window = new Window({
    settings: {
      enableJavaScriptEvaluation: false,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
      enableImageFileLoading: false,
    },
  });
  window.document.body.innerHTML = html;
  return window;
}
const clean = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();
export function recruitmentTitle(title: string): boolean {
  return (
    /모집|공급공고|분양공고/.test(title) &&
    /주택|아파트|행복|장기전세|국민임대|영구임대|전세임대|청년안심/.test(title) &&
    !/당첨|선정\s*결과|발표|서류.*(?:대상|결과)|매입공고|상가|공장|용지|용역|평가결과|휴무|입주\s*안내|채용|사무지원|희망돌보미/.test(
      title,
    )
  );
}
export interface BoardEntry {
  type: HousingType;
  id: string;
  title: string;
  url: string;
  posted: string;
}
export function boardListURL(
  source: BoardSource,
  page = 1,
  type: 'rental' | 'sale' = 'rental',
): string {
  const url = new URL(BOARD_SITES[source]);
  if (source === 'sh') {
    url.searchParams.set('multi_itm_seq', type === 'rental' ? '2' : '1');
    url.searchParams.set('recrnotiState', 'now');
    url.searchParams.set('srchTp', '0');
    url.searchParams.set('srchWord', '모집');
    url.searchParams.set('page', String(page));
  } else {
    url.searchParams.set('article.offset', String((page - 1) * 10));
    url.searchParams.set('articleLimit', '10');
  }
  return url.href;
}
export function parseBoardList(
  html: string,
  source: BoardSource,
  type: 'rental' | 'sale' = 'rental',
): { entries: BoardEntry[]; rowCount: number } {
  const window = documentFrom(html);
  try {
    const category = window.document
      .querySelector('input[name="multi_itm_seq"]')
      ?.getAttribute('value');
    if (source === 'sh' && category && category !== (type === 'rental' ? '2' : '1'))
      throw boardError('parser_changed', '요청한 주택 분류와 게시판 응답이 다릅니다.');
    const tables = [...window.document.querySelectorAll('table')];
    const table = tables.find((item) => {
      const headers = [...item.querySelectorAll('th')].map((node) => clean(node.textContent));
      return headers.includes('번호') && headers.includes('제목') && headers.includes('등록일');
    });
    if (!table)
      throw boardError(
        'parser_changed',
        '공고 목록 구조를 확인하지 못했습니다. 기존 공고는 유지됩니다.',
      );
    const entries = new Map<string, BoardEntry>();
    let rowCount = 0;
    for (const row of table.querySelectorAll('tbody tr')) {
      const anchor = [...row.querySelectorAll('a')].find((link) =>
        source === 'sh'
          ? /getDetailView\(\s*['"]?\d+/.test(link.getAttribute('onclick') ?? '')
          : /[?&]articleNo=\d+/.test(link.getAttribute('href') ?? ''),
      );
      if (!anchor) continue;
      rowCount++;
      const title = clean(anchor.textContent);
      if (!recruitmentTitle(title)) continue;
      const id =
        source === 'sh'
          ? /getDetailView\(\s*['"]?(\d+)/.exec(anchor.getAttribute('onclick') ?? '')?.[1]
          : /[?&]articleNo=(\d+)/.exec(anchor.getAttribute('href') ?? '')?.[1];
      if (!id) throw boardError('parser_changed', '공고 식별자를 확인할 수 없습니다.');
      const cells = [...row.querySelectorAll('td')].map((node) => clean(node.textContent));
      const rawDate = cells.find((cell) => /^\d{2,4}[-.]\d{2}[-.]\d{2}$/.test(cell));
      const posted = rawDate
        ? dateOnly(/^\d{2}[-.]/.test(rawDate) ? '20' + rawDate : rawDate)
        : null;
      if (!posted) throw boardError('parser_changed', '게시일을 확인할 수 없습니다.');
      const url =
        source === 'sh'
          ? new URL('view.do', BOARD_SITES.sh)
          : boardURL(anchor.getAttribute('href') ?? '', source);
      url.searchParams.set(source === 'sh' ? 'seq' : 'articleNo', id);
      if (source === 'gh') url.searchParams.set('mode', 'view');
      const item = {
        id,
        title,
        url: boardURL(url.href, source).href,
        posted,
        type:
          source === 'sh'
            ? type
            : /임대|전세|행복|기숙사/.test(title)
              ? ('rental' as const)
              : ('sale' as const),
      };
      const old = entries.get(id);
      if (old && JSON.stringify(old) !== JSON.stringify(item))
        throw boardError('parser_changed', '같은 공고의 목록 내용이 충돌합니다.');
      entries.set(id, item);
    }
    if (
      !rowCount &&
      !/검색(?:된)?\s*(?:내용|결과|데이터).*없|등록된.*없/.test(clean(table.textContent))
    )
      throw boardError('parser_changed', '목록 행을 읽을 수 없습니다.');
    return { entries: [...entries.values()], rowCount };
  } finally {
    void window.happyDOM.close();
  }
}

export function parseBoardDetail(html: string, source: BoardSource, entry: BoardEntry): Notice {
  const window = documentFrom(html);
  try {
    const table = [...window.document.querySelectorAll('table')].find((item) =>
      [...item.querySelectorAll('th')].some(
        (heading) => clean(heading.textContent) === entry.title,
      ),
    );
    if (!table)
      throw boardError(
        'parser_changed',
        '목록 제목과 일치하는 상세 본문을 확인하지 못했습니다. 대기열·접근 제한 여부를 확인해 주세요.',
      );
    const content = table.querySelector('td.cont');
    if (!content || clean(content.textContent).length < 20)
      throw boardError('parser_changed', '상세 공고 본문 구조를 확인하지 못했습니다.');
    const schedules: Schedule[] = [];
    let address = '';
    for (const row of content.querySelectorAll('tr')) {
      const cells = [...row.children].filter((cell) => ['TH', 'TD'].includes(cell.tagName));
      if (cells.length < 2) continue;
      const label = clean(cells[0].textContent).replace(/\s/g, '');
      const value = cells
        .slice(1)
        .map((cell) => clean(cell.textContent))
        .join(' ');
      if (/^(공급위치|소재지|주택소재지)$/.test(label)) address = value;
      if (!/^(청약|신청|접수|모집)(접수)?(기간|일정)$/.test(label)) continue;
      const dates = [...value.matchAll(/\d{4}[-.]\d{1,2}[-.]\d{1,2}/g)].map((match) => {
        const [year, month, day] = match[0].split(/[-.]/);
        return dateOnly(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      });
      if (dates.length === 2 && dates.every((date): date is string => date != null))
        schedules.push({ label: clean(cells[0].textContent), start: dates[0], end: dates[1] });
    }
    const periods = [
      ...new Map(
        schedules.map((schedule) => [JSON.stringify([schedule.start, schedule.end]), schedule]),
      ).values(),
    ];
    const deadline = periods.length
      ? periods
          .map((period) => period.end!)
          .sort()
          .at(-1)!
      : null;
    return {
      id: `${source}:board:${entry.id}`,
      externalId: entry.id,
      sourceId: source,
      source: source.toUpperCase(),
      issuerName: source === 'sh' ? '서울주택도시개발공사' : '경기주택도시공사',
      provider: `${source}-board`,
      title: entry.title,
      region: regionName(address),
      city: '',
      address: address || '공급 위치 원문 확인',
      type: entry.type,
      subtype: entry.type === 'rental' ? '공공임대 · 게시판' : '주택분양 · 게시판',
      isDemo: false,
      rules: [],
      rulesComplete: false,
      priceWon: null,
      depositWon: null,
      monthlyWon: null,
      area: null,
      areaBasis: null,
      priceBasis: '공식 게시판 첨부 공고문 금액·주택형 대조 필요',
      description:
        '공식 게시판 모집공고입니다. 게시일은 신청 자격 기준일이 아닙니다. 첨부 공고문에만 있는 일정·금액·신청 자격은 원문을 확인해 주세요.',
      announced: null,
      publicationDate: entry.posted,
      starts: periods.length === 1 ? periods[0].start : null,
      deadline,
      winnerDate: null,
      units: null,
      sourceUrl: entry.url,
      cancelled: /취소|철회|종료/.test(entry.title),
      schedules: periods,
      provenance: { method: 'web', reviewStatus: 'unverified' },
    };
  } finally {
    void window.happyDOM.close();
  }
}
