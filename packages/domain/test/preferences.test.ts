import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePreferences, preferenceScore, matchNotice } from '../src/index.js';
import { demoNotices } from '../../../test/fixtures/notices.js';

const today = '2026-11-08';
const notice = { ...demoNotices(today)[0], isDemo: false, rules: [], rulesComplete: false };

test('최고금액을 실제 최저가격으로 해석해 예산 불일치로 제외하지 않는다', () => {
  const priced = {
    ...notice,
    type: 'sale',
    pricing: {
      basis: 'model-maximum',
      operation: 'getAPTLttotPblancMdl',
      models: [
        { model: '1', housingType: '084A', supplyArea: null, units: 10, maximumWon: 700000000 },
      ],
    },
  };
  const result = matchNotice(priced, { saleBudget: 50000 }, today);
  assert.equal(result.preference.checks.find((check) => check.field === 'price').state, 'unknown');
  assert.equal(result.preference.state, 'unknown');
  assert.ok(result.reasons.some((message) => message.includes('최고금액')));
  assert.equal(result.status, 'review');
});

test('미입력과 비교 가능한 선호 일치를 구분하고 실제 자격은 확인 필요로 유지한다', () => {
  assert.equal(comparePreferences(notice, {}).state, 'unset');
  const result = matchNotice(notice, { regions: [notice.region], types: [notice.type] }, today);
  assert.equal(result.preference.state, 'matched');
  assert.equal(result.status, 'review');
  assert.equal(result.score, 45);
});

test('전국·미확인 지역을 관심 지역 밖으로 단정하거나 일치 점수를 주지 않는다', () => {
  for (const region of ['전국', '미확인']) {
    const comparison = comparePreferences({ ...notice, region }, { regions: ['서울'] });
    assert.equal(comparison.state, 'unknown');
    assert.equal(comparison.checks[0].state, 'unknown');
    assert.equal(preferenceScore(comparison), 0);
  }
});

test('희망 지역과 주거유형 불일치는 순위에 반영하지만 자격 부적격을 뜻하지 않는다', () => {
  const result = matchNotice(notice, { regions: ['제주'], types: ['officetel'] }, today);
  assert.equal(result.preference.state, 'mismatch');
  assert.equal(result.score, -45);
  assert.equal(result.status, 'review');
});

test('임대 보증금·월세를 별도로 비교하고 불일치를 일부 일치로 덮지 않는다', () => {
  const comparison = comparePreferences(
    { ...notice, type: 'rental', depositWon: 10000000, monthlyWon: 500000 },
    { depositBudget: 1000, monthlyBudget: 40, saleBudget: 999999 },
  );
  assert.equal(comparison.checks.find((check) => check.field === 'deposit').state, 'matched');
  assert.equal(comparison.checks.find((check) => check.field === 'monthly').state, 'mismatch');
  assert.equal(
    comparison.checks.some((check) => check.field === 'price'),
    false,
  );
  assert.equal(comparison.state, 'mismatch');
});

test('0원 예산·0원 표시 가격·미확인 가격을 구분하고 경계 금액을 포함한다', () => {
  const compare = (priceWon, saleBudget) =>
    comparePreferences({ ...notice, type: 'sale', priceWon }, { saleBudget });
  assert.equal(compare(0, 0).state, 'matched');
  assert.equal(compare(null, 0).state, 'unknown');
  assert.equal(compare(1, 0).state, 'mismatch');
  assert.equal(compare(10000000, 1000).state, 'matched');
  assert.equal(compare(10000001, 1000).state, 'mismatch');
});

test('일치한 지역이 있어도 미확인 예산은 확인 필요로 남기고 입력 객체를 바꾸지 않는다', () => {
  const input = { regions: [notice.region], depositBudget: 1000 };
  const n = { ...notice, type: 'rental', depositWon: null };
  const before = JSON.stringify({ n, input });
  assert.equal(comparePreferences(n, input).state, 'unknown');
  assert.equal(JSON.stringify({ n, input }), before);
});
