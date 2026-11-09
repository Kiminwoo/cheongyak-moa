import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardClient, robotsAllows, boardURL, BOARD_SITES } from '../src/core/board-http.js';
import { parseBoardList, parseBoardDetail, recruitmentTitle } from '../src/core/board-parser.js';
import { Store } from '../src/core/store.js';
import { collectBoards } from '../src/core/board-collectors.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const entry = {
  id: '100',
  title: '청년안심주택 입주자 모집공고',
  type: 'rental' as const,
  posted: '2026-11-01',
  url: 'https://www.i-sh.co.kr/main/view.do?seq=100',
};
const detail = (body: string) =>
  `<table><tr><th>${entry.title}</th></tr><tr><td class="cont">${body}</td></tr></table>`;

test('첨부 전용 일정은 미확인으로 두고 게시일을 자격 기준일로 사용하지 않는다', () => {
  const notice = parseBoardDetail(
    detail('2026-11-01 게시. 접수 일정과 공급 가격은 첨부 공고문을 확인하세요.'),
    'sh',
    entry,
  );
  assert.equal(notice.starts, null);
  assert.equal(notice.deadline, null);
  assert.equal(notice.announced, null);
  assert.equal(notice.publicationDate, entry.posted);
  assert.equal(notice.priceWon, null);
  assert.equal(notice.provenance.method, 'web');
  const scheduled = parseBoardDetail(
    detail('<table><tr><th>접수기간</th><td>2026-11-09 ~ 2026-11-20</td></tr></table>'),
    'sh',
    entry,
  );
  assert.equal(scheduled.starts, '2026-11-09');
  assert.equal(scheduled.deadline, '2026-11-20');
  assert.throws(() => parseBoardDetail('<html>대기열 안내</html>', 'sh', entry));
});

test('상세 구조 변경 시 기존 공고를 유지하고 GH 제한을 별도 기록한다', async (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'boards-'));
  const store = new Store(':memory:', { seed: false });
  const old = parseBoardDetail(
    detail('모집 내용과 신청 조건은 첨부 문서를 확인해 주세요.'),
    'sh',
    entry,
  );
  store.upsert(old);
  t.after(() => {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  });
  const list =
    '<table><thead><tr><th>번호</th><th>제목</th><th>등록일</th></tr></thead><tbody><tr><td>1</td><td><a onclick="getDetailView(100)">' +
    entry.title +
    '</a></td><td>2026-11-01</td></tr></tbody></table>';
  const results = await collectBoards(store, {
    rawDir: folder,
    interval: 0,
    env: {},
    today: '2026-11-08',
    fetchFn: async (url) => {
      if (url.pathname === '/robots.txt')
        return new Response(
          url.hostname.includes('gh.or.kr')
            ? 'User-agent: *\nDisallow: /'
            : 'User-agent: *\nDisallow:',
        );
      if (url.pathname.endsWith('view.do'))
        return new Response('<html>접근 제한</html>', { headers: { 'content-type': 'text/html' } });
      return new Response(
        url.searchParams.get('multi_itm_seq') === '1'
          ? list.replace(
              /<tbody>.*<\/tbody>/,
              '<tbody><tr><td>조회 결과가 없습니다</td></tr></tbody>',
            )
          : list,
        { headers: { 'content-type': 'text/html' } },
      );
    },
  });
  assert.equal(results[0].code, 'parser_changed');
  assert.equal(results[1].code, 'robots_denied');
  assert.equal(
    store.coverage().find((unit) => unit.sourceId === 'gh' && unit.unit === 'official-board')
      .errorCode,
    'robots_denied',
  );
  assert.equal(store.get(old.id).version, 1);
  assert.equal(store.get(old.id).withdrawnFromProvider, undefined);
});

test('robots 정책의 사용자 그룹·긴 경로·와일드카드·Allow 동률을 처리한다', () => {
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/main/list.do'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /main/', '/main/list.do'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', '/a.pdf'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', '/a.pdf?download=1'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /a\nAllow: /a', '/a'), true);
  assert.equal(
    robotsAllows('User-agent: CheongyakMoa\nDisallow:\nUser-agent: *\nDisallow: /', '/a'),
    true,
  );
  assert.equal(
    robotsAllows(
      'User-agent: CheongyakMoa\nDisallow: /a\nUser-agent: CheongyakMoa\nDisallow: /b',
      '/b',
    ),
    false,
  );
  assert.equal(robotsAllows('User-agent: *\nDisallow: /%61', '/a'), false);
  assert.throws(() => robotsAllows('<html>Forbidden</html>', '/a'));
});

test('자동 접근 제한이면 게시판 본문에 요청하지 않는다', async () => {
  const calls = [];
  const client = new BoardClient(
    'gh',
    async (url) => {
      calls.push(url.href);
      return new Response('User-agent: *\nDisallow: /gh/', {
        headers: { 'content-type': 'text/plain' },
      });
    },
    0,
  );
  await assert.rejects(
    client.html(BOARD_SITES.gh),
    (error) => error.publicCode === 'robots_denied',
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith('/robots.txt'));
});

test('외부·HTTP·인증정보 URL 및 외부 리다이렉트를 거부한다', async () => {
  for (const url of [
    'https://evil.example/a',
    'http://www.i-sh.co.kr/a',
    'https://user:pass@www.i-sh.co.kr/a',
    'https://www.i-sh.co.kr:8443/a',
  ])
    assert.throws(() => boardURL(url, 'sh'));
  const client = new BoardClient(
    'sh',
    async () =>
      new Response(null, { status: 302, headers: { location: 'https://evil.example/robots.txt' } }),
    0,
  );
  await assert.rejects(client.html(BOARD_SITES.sh), (error) => error.publicCode === 'unsafe_url');
});

test('게시판 HTML이 접근 정책 대신 반환되거나 정책 서버가 실패하면 본문을 읽지 않는다', async () => {
  for (const response of [new Response('<html>login</html>'), new Response('', { status: 503 })]) {
    let calls = 0;
    const client = new BoardClient(
      'sh',
      async () => {
        calls++;
        return response;
      },
      0,
    );
    await assert.rejects(client.html(BOARD_SITES.sh));
    assert.equal(calls, 1);
  }
});

test('SH 실제 목록 구조의 식별자·게시일을 읽고 발표·비주택 글을 제외한다', () => {
  const html = `<table><thead><tr><th>번호</th><th>제목</th><th>담당부서</th><th>등록일</th><th>조회수</th></tr></thead><tbody>
  <tr><td>1</td><td><a href="#" onclick="javascript:getDetailView('100');return false;">청년안심주택 입주자 모집공고</a></td><td>공급부</td><td>2026-11-01</td><td>10</td></tr>
  <tr><td>2</td><td><a href="#" onclick="getDetailView('101')">청년안심주택 당첨자 발표</a></td><td>공급부</td><td>2026-11-01</td><td>10</td></tr>
  </tbody></table><script>throw Error('실행되면 안 됨')</script>`;
  const result = parseBoardList(html, 'sh');
  assert.equal(result.rowCount, 2);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].id, '100');
  assert.equal(new URL(result.entries[0].url).searchParams.get('seq'), '100');
  assert.equal(result.entries[0].posted, '2026-11-01');
  assert.equal(recruitmentTitle('단지 내 상가 임차인 모집공고'), false);
  assert.equal(recruitmentTitle('주택 매입공고'), false);
  assert.throws(() => parseBoardList('<html>로그인 필요</html>', 'sh'));
});
