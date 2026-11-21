import { createHash } from 'node:crypto';
import { isRecord } from '@cheongyak-moa/contracts';
import type { CollectionResult, Environment, FetchJSON, Notice } from '@cheongyak-moa/contracts';
import { dateOnly, koreaToday } from '@cheongyak-moa/domain';
import { getJSON } from './collectors.js';
import { collectionConfig } from './config.js';
import { IH_COVERAGE } from './coverage.js';
import { inspectNotice } from './data-quality.js';
import { saveRaw } from './ingestion.js';
import { recruitmentTitle } from './board-parser.js';
import type { Store } from './store.js';

const endpoint = 'https://apis.data.go.kr/B552831/ih/slls-posts';
const pageSize = 10;
const pageLimit = 100;

function readPage(payload: unknown, page: number) {
  const envelope = isRecord(payload) && isRecord(payload.response) ? payload.response : payload;
  if (!isRecord(envelope) || !isRecord(envelope.header))
    throw new Error('인천도시공사 응답 헤더 누락');
  const code = String(envelope.header.resultCode);
  const body = envelope.body;
  if (code === '03' && body == null) return { total: 0, rows: [] };
  if (!['00', '03'].includes(code) || !isRecord(body))
    throw new Error('인천도시공사 응답 본문 오류');
  const total = Number(body.totalCount);
  const rows = body.posts ?? (total === 0 ? [] : null);
  if (
    body.totalCount == null ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    (code === '03' && total !== 0) ||
    Number(body.pageNo) !== page ||
    !Array.isArray(rows) ||
    ![pageSize, rows.length].includes(Number(body.numOfRows)) ||
    !rows.every(isRecord) ||
    rows.length !== Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize))
  )
    throw new Error('인천도시공사 페이지 번호 또는 건수 불일치');
  return { total, rows };
}

function normalizePost(row: Record<string, unknown>, from: string, to: string): Notice | null {
  const { sj: title, tyNm: subtype, seNm: division, crtYmd, link } = row;
  if (typeof title !== 'string' || !title.trim()) throw new Error('공고 제목 누락');
  if (division !== '임대' && division !== '분양') return null;
  if (typeof subtype !== 'string' || !recruitmentTitle(title + ' ' + subtype)) return null;

  const posted = typeof crtYmd === 'string' ? dateOnly(crtYmd) : null;
  if (!posted || posted < from || posted > to) throw new Error('공고 게시일 범위 불일치');
  const url =
    typeof link === 'string' && link.trim() ? URL.parse(link, 'https://www.ih.co.kr/') : null;
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.pathname === '/' ||
    !['www.ih.co.kr', 'ih.co.kr'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    [...url.searchParams.keys()].some((name) => /key|token|password|secret|auth/i.test(name))
  )
    throw new Error('인천도시공사 원문 링크 오류');
  const sourceUrl = url.href;
  url.hash = '';
  url.hostname = 'www.ih.co.kr';
  url.searchParams.sort();
  const externalId = createHash('sha256').update(url.href).digest('hex').slice(0, 32);
  const notice: Notice = {
    id: `ih:${externalId}`,
    externalId,
    sourceId: 'local',
    provider: 'ih-api',
    source: '인천도시공사',
    issuerName: '인천도시공사',
    sourceUrl,
    title,
    type: division === '임대' ? 'rental' : 'sale',
    subtype,
    region: '인천',
    city: '',
    address: '',
    publicationDate: posted,
    announced: null,
    starts: null,
    deadline: null,
    winnerDate: null,
    units: null,
    priceWon: null,
    depositWon: null,
    monthlyWon: null,
    area: null,
    areaBasis: null,
    priceBasis: '공고 원문 확인',
    description:
      '인천도시공사 공고 목록 자료입니다. 접수 일정·금액·신청 조건은 원문에서 확인하세요.',
    cancelled: /취소s*공고|공고s*취소/.test(title),
    isDemo: false,
    rules: [],
    rulesComplete: false,
    provenance: { method: 'api', reviewStatus: 'unverified' },
  };
  notice.quality = inspectNotice(notice);
  return notice;
}

export async function collectIH(
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
  const { sourceId: source, unit } = IH_COVERAGE;
  const previous = store
    .coverage()
    .find((entry) => entry.sourceId === source && entry.unit === unit);
  if (onlyFailed && previous?.status !== 'failed') return [];
  let key = env.IH_SERVICE_KEY?.trim();
  if (!key)
    return [
      {
        source,
        status: 'unconfigured',
        count: 0,
        message: '인천도시공사 API 인증키·활용 승인 필요',
      },
    ];
  try {
    key = decodeURIComponent(key);
  } catch {
    // 일반 인증키를 그대로 사용합니다.
  }
  const range = collectionConfig(env, today);
  const from = onlyFailed ? (previous?.from ?? range.from) : range.from;
  const to = onlyFailed ? (previous?.to ?? range.to) : range.to;
  store.beginUnit(IH_COVERAGE, from, to);
  const run = store.beginRun(source);
  let fetched = 0;
  try {
    let total: number | undefined;
    const seen = new Set<string>();
    const staged = new Map<string, Notice>();
    for (let page = 1; page <= pageLimit; page++) {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({
        serviceKey: key,
        pageNo: String(page),
        numOfRows: String(pageSize),
        startCrtrYmd: from,
        endCrtrYmd: to,
      }).toString();
      const payload = await getJSON(url, fetchFn);
      const parsed = readPage(payload, page);
      if (total != null && total !== parsed.total) throw new Error('수집 중 전체 건수 변경');
      total = parsed.total;
      if (total > pageLimit * pageSize)
        throw Object.assign(new Error('인천도시공사 페이지 한도'), { publicCode: 'page_limit' });
      for (const row of parsed.rows) {
        const fingerprint = JSON.stringify(row);
        if (seen.has(fingerprint)) throw new Error('중복 공고 응답');
        seen.add(fingerprint);
        const notice = normalizePost(row, from, to);
        if (!notice) continue;
        if (staged.has(notice.id)) throw new Error('공고 원문 링크 중복');
        staged.set(notice.id, notice);
      }
      saveRaw(rawDir, 'ih', run, String(page), payload);
      fetched += parsed.rows.length;
      if (fetched === total) break;
    }
    const notices = [...staged.values()];
    const active = notices.filter((notice) => !notice.cancelled);
    let changes = 0;
    const message = `인천도시공사 · 공고 ${active.length}건 · 접수 일정·금액 원문 확인`;
    store.transaction(() => {
      for (const notice of notices) changes += Number(store.writeNotice(notice));
      for (const prior of store.all()) {
        if (
          prior.provider !== 'ih-api' ||
          prior.withdrawnFromProvider ||
          !prior.publicationDate ||
          prior.publicationDate > to ||
          staged.has(prior.id)
        )
          continue;
        const { favorite, version, updatedAt, lastSeenAt, ...body } = prior;
        changes += Number(store.writeNotice({ ...body, withdrawnFromProvider: true }));
      }
      store.finishUnit(source, unit, 'success', fetched, active.length);
      store.finishRun(run, 'success', active.length, message);
    });
    return [{ source, status: 'success', count: active.length, changes, message }];
  } catch (error) {
    const code =
      isRecord(error) && typeof error.publicCode === 'string'
        ? error.publicCode
        : 'invalid_response';
    const message = `인천도시공사 API 수집 실패(${code}) · 기존 자료 유지`;
    store.finishUnit(source, unit, 'failed', fetched, 0, code);
    store.finishRun(run, 'failed', 0, message, 0, code);
    return [{ source, status: 'failed', count: 0, code, message }];
  }
}
