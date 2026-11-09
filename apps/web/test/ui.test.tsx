import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import App from '../src/App.js';
import { demoNotices } from '../../api/src/core/demo.js';
import { matchNotice } from '@cheongyak-moa/domain';

async function setup(t, { live = false, pricing = false, local = false, readOnly = false } = {}) {
  const w = new Window({ url: 'http://localhost:4310' });
  const prior = new Map();
  for (const [key, value] of Object.entries({
    window: w,
    document: w.document,
    navigator: w.navigator,
    HTMLElement: w.HTMLElement,
    Event: w.Event,
    MouseEvent: w.MouseEvent,
    FormData: w.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  const { createRoot } = await import('react-dom/client');
  const container = w.document.createElement('div');
  w.document.body.append(container);
  const root = createRoot(container);
  const data = {
    readOnly,
    profile: {},
    today: '2026-11-08',
    regions: ['서울', '경기', '인천'],
    sources: [],
    runs: [],
    collecting: false,
    notices: demoNotices('2026-11-08').map((n) => ({
      ...n,
      version: 1,
      favorite: false,
      match: matchNotice(n, {}, '2026-11-08'),
    })),
  };
  const calls = [];
  if (local) {
    data.coverage = [
      {
        sourceId: 'sh',
        unit: 'myhome-rental',
        label: '마이홈 목록',
        channel: 'api',
        implemented: true,
        scope: '응답 포함 기관만',
        status: 'success',
        fetchedCount: 185,
        activeCount: 0,
        from: null,
        to: null,
        lastSuccessAt: '2026-11-08T00:00:00Z',
      },
      {
        sourceId: 'gh',
        unit: 'official-board',
        label: '공식 게시판',
        channel: 'web',
        implemented: true,
        scope: '정책 허용 범위',
        status: 'failed',
        errorCode: 'robots_denied',
        fetchedCount: 0,
        activeCount: 0,
        from: null,
        to: null,
        lastSuccessAt: null,
      },
      {
        sourceId: 'local',
        unit: 'agency-boards',
        label: '기관별 자체 공고',
        channel: 'web',
        implemented: false,
        scope: '기관별 연동 예정',
        status: 'planned',
        fetchedCount: null,
        activeCount: null,
        from: null,
        to: null,
        lastSuccessAt: null,
      },
    ];
    data.sources = ['sh', 'gh', 'local'].map((id) => ({
      id,
      name: id.toUpperCase(),
      scope: '마이홈 공공임대',
      configured: true,
      count: 0,
      status: 'adapter',
      url: 'https://www.data.go.kr/data/15108420/openapi.do',
    }));
    data.runs = ['sh', 'gh', 'local'].map((sourceId, index) => ({
      id: index,
      sourceId,
      method: 'api',
      status: 'success',
      count: 0,
      message: '마이홈 공공임대 0건',
      startedAt: '2026-11-08T00:00:00Z',
      endedAt: '2026-11-08T00:00:00Z',
      warnings: 0,
    }));
  }
  if (live) {
    const notice = structuredClone(data.notices[0]);
    notice.id = 'applyhome-live-test';
    notice.title = '수집된 실제 공고 테스트';
    notice.sourceId = 'applyhome';
    notice.isDemo = false;
    notice.rules = [];
    notice.rulesComplete = false;
    if (pricing) {
      notice.type = 'sale';
      notice.priceWon = null;
      notice.pricing = {
        basis: 'model-maximum',
        operation: 'getAPTLttotPblancMdl',
        models: [
          { model: '1', housingType: '059A', supplyArea: '80.5', units: 10, maximumWon: 500000000 },
          { model: '2', housingType: '084A', supplyArea: '112', units: 20, maximumWon: 700000000 },
        ],
      };
    }
    notice.match = matchNotice(notice, {}, data.today);
    data.notices.push(notice);
  }
  const requestFn = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path === '/api/profile') {
      data.profile = options.body;
      data.notices = data.notices.map((n) => ({
        ...n,
        match: matchNotice(n, data.profile, data.today),
      }));
      return { ok: true };
    }
    if (path === '/api/favorites') {
      data.notices = data.notices.map((n) =>
        n.id === options.body.id ? { ...n, favorite: options.body.saved } : n,
      );
      return { ok: true };
    }
    if (path.startsWith('/api/versions/')) return [];
    return structuredClone(data);
  };
  await act(async () => root.render(<App requestFn={requestFn} />));
  t.after(async () => {
    await act(async () => root.unmount());
    await w.happyDOM.abort();
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { w, container, calls };
}
test('React 컴포넌트가 공고와 모바일 메뉴를 렌더링한다', async (t) => {
  const { container } = await setup(t);
  assert.equal(container.querySelectorAll('.card').length, 8);
  assert.equal(container.querySelectorAll('.mobile-nav button').length, 4);
  assert.ok(container.textContent.includes('실제 공고가 아닌'));
  assert.ok(container.querySelector('.header-actions button'));
});

test('공유 화면은 실제 공고를 조회하면서 개인 조건과 관리 기능을 제공하지 않는다', async (t) => {
  const { container, calls } = await setup(t, { live: true, readOnly: true });
  assert.ok(container.textContent.includes('공유 미리보기 · 조회 전용'));
  assert.equal(container.querySelectorAll('.card').length, 1);
  assert.equal(container.querySelector('#profile-summary'), null);
  assert.equal(container.querySelector('.hero-link'), null);
  assert.equal(container.querySelectorAll('.mobile-nav button').length, 2);
  assert.ok([...container.querySelectorAll('.bookmark')].every((button) => button.disabled));
  await act(async () => container.querySelector('.card-title').click());
  assert.equal(container.querySelector('dialog').getAttribute('aria-label'), '청약 공고 상세');
  assert.ok(!calls.some((call) => call.path?.startsWith('/api/versions/')));
  await act(async () => container.querySelector('.close-dialog').click());
  await act(async () => container.querySelector('.local-chip').click());
  assert.ok(container.querySelector('#sources-panel').textContent.includes('공고 출처'));
  assert.ok(!container.querySelector('#sources-panel').textContent.includes('.env'));
  assert.ok(!calls.some((call) => call.method && call.method !== 'GET'));
});

test('기관별 마이홈 수집 경로와 정상 응답 0건을 연동 예정과 구분해서 표시한다', async (t) => {
  const { container } = await setup(t, { local: true });
  await act(async () => container.querySelector('.local-chip').click());
  const panel = container.querySelector('#sources-panel');
  assert.ok(panel.textContent.includes('마이홈 공공주택 모집공고 API'));
  assert.ok(panel.textContent.includes('기관 홈페이지 자체 공고 전체가 아닙니다'));
  assert.equal(panel.querySelectorAll('table[aria-label="기관별 수집 현황"] tbody tr').length, 3);
  assert.ok(panel.textContent.includes('응답 수신 · 해당 공고 0건'));
  assert.ok(
    !panel.querySelector('table[aria-label="기관별 수집 현황"]').textContent.includes('연동 예정'),
  );
  assert.ok(panel.textContent.includes('미연동'));
  assert.ok(panel.textContent.includes('robots_denied'));
  assert.ok(panel.textContent.includes('검증 이력 없음'));
});

test('접수 중 통계 카드를 클릭하면 해당 공고만 표시하고 다시 클릭하거나 필터를 해제할 수 있다', async (t) => {
  const { container } = await setup(t);
  const expected = demoNotices('2026-11-08').filter(
    (notice) => matchNotice(notice, {}, '2026-11-08').stage === 'open',
  );
  const card = container.querySelector('button.stat-action');
  assert.equal(card.getAttribute('aria-pressed'), 'false');
  const originalCount = container.querySelectorAll('.card').length;
  await act(async () => card.click());
  assert.equal(card.getAttribute('aria-pressed'), 'true');
  assert.equal(container.querySelectorAll('.card').length, expected.length);
  assert.deepEqual(
    [...container.querySelectorAll('.card-title')].map((title) => title.textContent).sort(),
    expected.map((notice) => notice.title).sort(),
  );
  assert.ok(container.querySelector('#result-count').textContent.includes(String(expected.length)));
  await act(async () => card.click());
  assert.equal(container.querySelectorAll('.card').length, originalCount);
  await act(async () => card.click());
  await act(async () => container.querySelector('[aria-label="접수 중 필터 해제"]').click());
  assert.equal(card.getAttribute('aria-pressed'), 'false');
  assert.equal(container.querySelectorAll('.card').length, originalCount);
});

test('수집 공고가 있으면 실제 데이터를 먼저 표시하고 선택한 예시 모드는 유지한다', async (t) => {
  const { container, w } = await setup(t, { live: true });
  assert.equal(container.querySelectorAll('.card').length, 1);
  assert.ok(container.textContent.includes('수집된 실제 공고 테스트'));
  const mode = container.querySelector('#filter-data');
  assert.ok(mode);
  await act(async () => {
    mode.value = 'demo';
    mode.dispatchEvent(new w.Event('change', { bubbles: true }));
  });
  assert.equal(container.querySelectorAll('.card').length, 8);
  await act(async () => w.dispatchEvent(new w.Event('online')));
  assert.equal(mode.value, 'demo');
  assert.equal(container.querySelectorAll('.card').length, 8);
});
test('관심 저장과 관심 탭이 React 상태와 API를 갱신한다', async (t) => {
  const { container, calls } = await setup(t);
  await act(async () => container.querySelector('.bookmark').click());
  assert.ok(calls.some((c) => c.path === '/api/favorites' && c.body.saved === true));
  await act(async () => container.querySelector('.desktop-nav button:last-child').click());
  assert.equal(container.querySelectorAll('.card').length, 1);
  assert.ok(container.querySelector('.bookmark').getAttribute('aria-pressed') === 'true');
});
test('조건 모달은 저장 후 닫히고 새 추천 결과를 반영한다', async (t) => {
  const { container, w, calls } = await setup(t);
  await act(async () => container.querySelector('.hero-link').click());
  const dialog = container.querySelector('dialog');
  assert.ok(dialog.hasAttribute('open'));
  container.querySelector('input[name="regions"][value="서울"]').checked = true;
  container.querySelector('input[name="birthDate"]').value = '1998-01-01';
  container.querySelector('select[name="housingOwned"]').value = 'no';
  await act(async () =>
    container
      .querySelector('form')
      .dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })),
  );
  assert.ok(calls.some((c) => c.path === '/api/profile' && c.body.regions.includes('서울')));
  assert.equal(container.querySelector('dialog'), null);
  assert.ok(container.querySelector('#profile-summary').textContent.includes('서울'));
});
test('오프라인 시 저장 버튼을 비활성화하고 안내한다', async (t) => {
  const { container, w } = await setup(t);
  await act(async () => w.dispatchEvent(new w.Event('offline')));
  assert.ok(container.querySelector('.connection-banner').textContent.includes('오프라인'));
  assert.ok([...container.querySelectorAll('.bookmark')].every((b) => b.disabled));
});
test('공고 상세 모달은 닫기와 캘린더 이동이 동작한다', async (t) => {
  const { container } = await setup(t);
  await act(async () => container.querySelector('.card-title').click());
  assert.ok(container.querySelector('dialog').textContent.includes('원본과 변경 이력'));
  await act(async () => container.querySelector('.close-dialog').click());
  assert.equal(container.querySelector('dialog'), null);
  await act(async () => container.querySelectorAll('.desktop-nav button')[2].click());
  assert.ok(container.querySelector('.desktop-calendar'));
  assert.ok(container.querySelector('.mobile-agenda'));
  assert.equal(container.querySelectorAll('.card').length, 0);
});

test('실제 공고 상세에 선호 비교와 자격 확인 상태를 함께 보여준다', async (t) => {
  const { container } = await setup(t, { live: true });
  assert.ok(container.textContent.includes('선호 조건을 설정해 주세요'));
  await act(async () => container.querySelector('.card-title').click());
  const detail = container.querySelector('section[aria-label="선호 조건 비교"]');
  assert.ok(detail);
  assert.ok(detail.textContent.includes('관심 지역'));
  assert.ok(detail.textContent.includes('보증금'));
  assert.ok(detail.textContent.includes('미입력'));
  assert.ok(container.querySelector('dialog').textContent.includes('공고 확인 필요'));
});

test('카드에 최고금액 범위를 표시하고 상세에 주택형별 금액과 기준을 표시한다', async (t) => {
  const { container } = await setup(t, { live: true, pricing: true });
  assert.ok(container.querySelector('.price-row').textContent.includes('주택형별 최고금액'));
  assert.ok(container.querySelector('.price-main').textContent.includes('5억원 ~ 7억원'));
  await act(async () => container.querySelector('.card-title').click());
  const section = container.querySelector('section[aria-label="주택형별 공급 가격"]');
  assert.ok(section.textContent.includes('059A'));
  assert.ok(section.textContent.includes('084A'));
  assert.equal(section.querySelectorAll('tbody tr').length, 2);
  assert.ok(section.textContent.includes('실제 최저 분양가를 뜻하지 않습니다'));
});
