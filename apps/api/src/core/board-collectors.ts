import { isRecord } from '@cheongyak-moa/contracts';
import type { Environment, Notice, CollectionResult } from '@cheongyak-moa/contracts';
import { isActiveNotice, koreaToday } from '@cheongyak-moa/domain';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from './store.js';
import { BoardClient, boardError } from './board-http.js';
import type { BoardSource, BoardFetch } from './board-http.js';
import { boardListURL, parseBoardList, parseBoardDetail } from './board-parser.js';
import type { BoardEntry } from './board-parser.js';
import { inspectNotice } from './data-quality.js';
import { COVERAGE_UNITS } from './coverage.js';

export function boardIdentity(value: string | null, source: string): string | null {
  if (!value || !['sh', 'gh'].includes(source)) return null;
  try {
    const url = new URL(value);
    const domain = source === 'sh' ? 'i-sh.co.kr' : 'gh.or.kr';
    if (![domain, 'www.' + domain].includes(url.hostname)) return null;
    const id = url.searchParams.get(source === 'sh' ? 'seq' : 'articleNo');
    return id && /^\d+$/.test(id) ? `${source}:${id}` : null;
  } catch {
    return null;
  }
}
export async function collectBoards(
  store: Store,
  {
    env = process.env,
    rawDir = 'data/raw',
    fetchFn = fetch,
    interval = 1000,
    today = koreaToday(),
    onlyFailed = false,
    includeClosed = false,
  }: {
    env?: Environment;
    rawDir?: string;
    fetchFn?: BoardFetch;
    interval?: number;
    today?: string;
    onlyFailed?: boolean;
    includeClosed?: boolean;
  } = {},
): Promise<CollectionResult[]> {
  const maxPages = Number(env.BOARD_MAX_PAGES || 5);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20)
    throw new Error('게시판 페이지 수는 1~20 사이의 정수여야 합니다.');
  const results: CollectionResult[] = [];
  for (const source of ['sh', 'gh'] as const) {
    if (
      onlyFailed &&
      !store
        .coverage()
        .some(
          (unit) =>
            unit.sourceId === source && unit.unit === 'official-board' && unit.status === 'failed',
        )
    )
      continue;
    store.beginUnit(
      COVERAGE_UNITS.find((unit) => unit.sourceId === source && unit.unit === 'official-board')!,
    );
    const run = store.beginRun(source, 'web');
    const client = new BoardClient(source, fetchFn, interval);
    const folder = join(rawDir, 'boards', source, String(run));
    const save = (name: string, html: string) => {
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, name), html);
    };
    try {
      const entries = new Map<string, { entry: BoardEntry; closed: boolean }>();
      let complete = true;
      const types = source === 'sh' ? (['rental', 'sale'] as const) : (['rental'] as const);
      const scopes = types.map((type) => ({ type, state: 'now' as const, closed: false }));
      const completed =
        includeClosed && source === 'sh'
          ? types.map((type) => ({ type, state: 'suc' as const, closed: true }))
          : [];
      for (const { type, state, closed } of [...completed, ...scopes]) {
        let ended = false;
        const pages = new Set<string>();
        for (let page = 1; page <= maxPages; page++) {
          const html = await client.html(boardListURL(source, page, type, state));
          save(`list-${type}-${state}-${page}.html`, html);
          const parsed = parseBoardList(html, source, type, state);
          const fingerprint = JSON.stringify(parsed.entries);
          if (parsed.entries.length && pages.has(fingerprint))
            throw boardError('parser_changed', '같은 모집 목록 페이지가 반복됐습니다.');
          pages.add(fingerprint);
          for (const entry of parsed.entries) {
            const old = entries.get(entry.id);
            if (old && JSON.stringify(old.entry) !== JSON.stringify(entry))
              throw boardError('parser_changed', '게시판 분류 사이 공고 식별자가 충돌합니다.');
            // 진행 중 목록은 완료 목록과 중복될 때 현재 상태를 우선합니다.
            entries.set(entry.id, { entry, closed });
          }
          if (parsed.rowCount < 10) {
            ended = true;
            break;
          }
        }
        complete &&= ended;
      }
      const staged: Notice[] = [];
      const existing = store.all();
      for (const { entry, closed } of entries.values()) {
        const html = await client.html(entry.url);
        save(`detail-${entry.id}.html`, html);
        const notice = parseBoardDetail(html, source, entry);
        const duplicate = existing.find(
          (item) =>
            item.sourceId === source &&
            item.type === notice.type &&
            boardIdentity(item.sourceUrl, source) === boardIdentity(notice.sourceUrl, source),
        );
        if (duplicate) notice.id = duplicate.id;
        if (closed) notice.sourceStatus = '접수마감';
        notice.quality = inspectNotice(notice);
        if (notice.quality.some((issue) => issue.severity === 'error'))
          throw boardError('parser_changed', '게시판 공고 일정 검증에 실패했습니다.');
        staged.push(notice);
      }
      const active = staged.filter((notice) => isActiveNotice(notice, today));
      const terminal = staged.filter(
        (notice) => !isActiveNotice(notice, today) && (includeClosed || store.get(notice.id)),
      );
      let changes = 0;
      store.transaction(() => {
        for (const notice of [...active, ...terminal]) changes += Number(store.writeNotice(notice));
        if (complete) {
          const present = new Set(staged.map((notice) => notice.id));
          for (const old of existing)
            if (
              old.provider === `${source}-board` &&
              !present.has(old.id) &&
              !old.withdrawnFromProvider
            ) {
              const { favorite, version, lastSeenAt, updatedAt, ...body } = old;
              store.writeNotice({ ...body, withdrawnFromProvider: true });
            }
        }
        const message = `공식 게시판 · ${active.length}건 · ${changes}건 신규·변경 · ${complete ? '현재 조회 목록 확인 완료' : `분류별 최근 ${maxPages}페이지 한정`} · 일정·금액 미확인은 원문 확인 필요`;
        store.finishUnit(
          source,
          'official-board',
          'success',
          staged.length,
          active.length,
          complete ? null : 'page_limit',
        );
        store.finishRun(
          run,
          'success',
          active.length,
          message,
          active.reduce((sum, notice) => sum + (notice.quality?.length ?? 0), 0),
        );
      });
      results.push({
        source,
        status: 'success',
        count: active.length,
        changes,
        message: store.runs().find((item) => item.id === run)!.message!,
      });
    } catch (error) {
      const code =
        isRecord(error) && typeof error.publicCode === 'string' ? error.publicCode : 'board_failed';
      const messages: Record<string, string> = {
        robots_denied: '기관이 이 게시판의 자동 수집을 제한합니다.',
        robots_unknown: '기관의 접근 정책을 확인하지 못했습니다.',
        network_denied: '실행 환경에서 공식 게시판 접속이 차단됐습니다.',
        parser_changed: '모집 목록·상세 구조 또는 항목을 검증하지 못했습니다.',
        access_denied: '공식 게시판 접근이 제한됐습니다.',
      };
      const message =
        (messages[code] ?? '공식 게시판 수집을 완료하지 못했습니다.') + ' 기존 자료는 유지됩니다.';
      store.finishRun(run, 'failed', 0, message, 0, code);
      store.finishUnit(source, 'official-board', 'failed', 0, 0, code);
      results.push({ source, status: 'failed', count: 0, message, code });
    } finally {
      for (const [origin, policy] of client.policySnapshot())
        save(`robots-${new URL(origin).hostname}.txt`, policy);
    }
  }
  return results;
}
