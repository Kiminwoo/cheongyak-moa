import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import App from '../src/App.js';
import { demoNotices } from '../../api/src/core/demo.js';
import { matchNotice } from '@cheongyak-moa/domain';

async function setup(t) {
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
