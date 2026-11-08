import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dateOnly,
  koreaToday,
  regionName,
  validateProfile,
  matchNotice,
  stage,
} from '../src/matching.js';
import { demoNotices } from '../../../test/fixtures/notices.js';
const today = '2026-11-08',
  demo = demoNotices(today)[0];
test('KST 기준으로 날짜 경계를 계산한다', () =>
  assert.equal(koreaToday(new Date('2026-11-07T16:00:00Z')), '2026-11-08'));
test('존재하지 않는 날짜를 거부한다', () => {
  assert.equal(dateOnly('2026-02-30'), null);
  assert.equal(dateOnly('2026.11.08'), '2026-11-08');
  assert.equal(dateOnly('20261108'), '2026-11-08');
});
test('지역명을 공통 코드로 변환한다', () => {
  assert.equal(regionName('충청남도 아산시'), '충남');
  assert.equal(regionName('전북특별자치도'), '전북');
  assert.equal(regionName('전국'), '전국');
  assert.equal(regionName('알수없는지역'), '미확인');
});
test('알 수 없는 조건과 음수·무한 예산을 거부한다', () => {
  for (const p of [
    { regions: ['없는 지역'] },
    { types: ['land'] },
    { saleBudget: -1 },
    { depositBudget: Infinity },
    { monthlyBudget: 0.2 },
    { birthDate: '2026-02-30' },
    { birthDate: '2027-01-01' },
    { housingOwned: 'maybe' },
  ])
    assert.throws(() => validateProfile(p, today));
});
test('중복 지역을 제거하고 0원 예산을 유지한다', () => {
  const p = validateProfile({ regions: ['서울', '서울'], saleBudget: 0 }, today);
  assert.deepEqual(p.regions, ['서울']);
  assert.equal(p.saleBudget, 0);
  assert.equal(p.depositBudget, null);
});
test('누락 정보를 신청 가능으로 판정하지 않는다', () => {
  const m = matchNotice(demo, {}, today);
  assert.equal(m.status, 'missing');
  assert.ok(m.missing.includes('생년월일'));
});
test('실제 공고를 예시 규칙으로 적격 확정하지 않는다', () => {
  const m = matchNotice(
    { ...demo, isDemo: false },
    { birthDate: '1998-01-01', housingOwned: 'no' },
    today,
  );
  assert.equal(m.status, 'review');
});
test('검토·근거 없는 규칙으로 판정하지 않는다', () => {
  const m = matchNotice(
    { ...demo, rules: demo.rules.map((r) => ({ ...r, approved: false })) },
    { birthDate: '1998-01-01', housingOwned: 'no' },
    today,
  );
  assert.equal(m.status, 'review');
});
test('예시 공고의 모든 테스트 조건이 맞을 때만 예시 일치로 표시한다', () => {
  const m = matchNotice(
    demo,
    { birthDate: '1998-01-01', housingOwned: 'no', regions: ['서울'] },
    today,
  );
  assert.equal(m.status, 'demo-match');
  assert.ok(m.reasons.includes('관심 지역에 있어요'));
});
test('현재 나이가 아닌 공고 기준일의 만 나이로 비교한다', () => {
  const n = {
    ...demo,
    rules: [
      { field: 'age', min: 19, max: 19, basisDate: '2026-10-27', approved: true, evidence: 'test' },
    ],
  };
  assert.equal(matchNotice(n, { birthDate: '2007-10-28' }, today).status, 'ineligible');
  assert.equal(matchNotice(n, { birthDate: '2007-10-27' }, today).status, 'demo-match');
});
test('예산 미확인을 0원으로 취급하지 않는다', () => {
  const m = matchNotice({ ...demo, depositWon: null }, { depositBudget: 1000 }, today);
  assert.ok(m.reasons.some((r) => r.includes('보증금 미확인')));
  assert.ok(!m.reasons.some((r) => r.includes('보증금이 입력 예산 이내')));
});
test('분양·보증금·월세 예산을 각각 비교한다', () => {
  const m = matchNotice(demo, { saleBudget: 1, depositBudget: 5000, monthlyBudget: 10 }, today);
  assert.ok(m.reasons.some((r) => r.includes('보증금이 입력 예산 이내')));
  assert.ok(m.reasons.some((r) => r.includes('월 임대료가 입력 예산을 초과')));
});
test('잘못된 필드 자료형을 조용히 저장하지 않는다', () => {
  for (const p of [
    { regions: '서울' },
    { types: 'sale' },
    { birthDate: 20000101 },
    { saleBudget: true },
    { depositBudget: [] },
  ])
    assert.throws(() => validateProfile(p, today));
});
test('마감 당일은 접수 중으로 남기고 취소를 우선한다', () => {
  assert.equal(stage({ ...demo, deadline: today }, today), 'open');
  assert.equal(stage({ ...demo, deadline: '2026-11-07' }, today), 'closed');
  assert.equal(stage({ ...demo, starts: null }, today), 'unknown');
  assert.equal(stage({ ...demo, cancelled: true }, today), 'cancelled');
});
