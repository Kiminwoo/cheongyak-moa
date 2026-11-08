import { isRecord } from '@cheongyak-moa/contracts';
import { comparePreferences, preferenceScore } from './preferences.js';
import type {
  Profile,
  HousingType,
  HousingOwned,
  Notice,
  NoticeStage,
  MatchResult,
  MatchStatus,
} from '@cheongyak-moa/contracts';
export const REGIONS = [
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '광주',
  '대전',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
];
export function koreaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function dateOnly(value: unknown): string | null {
  const text = String(value ?? '')
    .trim()
    .replaceAll('.', '-');
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(text);
  if (!match) return null;
  const [, y, m, d] = match;
  const result = `${y}-${m}-${d}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result
    ? null
    : result;
}
export function regionName(value: unknown = ''): string {
  const v = String(value);
  if (v.trim() === '전국') return '전국';
  const aliases = {
    충청북: '충북',
    충청남: '충남',
    전라북: '전북',
    전북특별: '전북',
    전라남: '전남',
    경상북: '경북',
    경상남: '경남',
    강원: '강원',
    제주: '제주',
  };
  for (const [prefix, region] of Object.entries(aliases)) if (v.startsWith(prefix)) return region;
  return REGIONS.find((region) => v.startsWith(region)) ?? '미확인';
}
export function validateProfile(input: unknown, today = koreaToday()): Profile {
  if (!isRecord(input)) throw new Error('조건 입력 형식을 확인해 주세요.');
  if (
    (input.regions != null && !Array.isArray(input.regions)) ||
    (input.types != null && !Array.isArray(input.types))
  )
    throw new Error('지역과 주거유형은 목록으로 입력해 주세요.');
  if (input.birthDate != null && typeof input.birthDate !== 'string')
    throw new Error('생년월일 형식을 확인해 주세요.');
  for (const key of ['saleBudget', 'depositBudget', 'monthlyBudget'])
    if (input[key] != null && !['string', 'number'].includes(typeof input[key]))
      throw new Error('예산 입력 형식을 확인해 주세요.');
  const result = {
    regions: (Array.isArray(input.regions) ? [...new Set(input.regions)] : []) as string[],
    types: (Array.isArray(input.types) ? [...new Set(input.types)] : []) as HousingType[],
    birthDate: (input.birthDate || '') as string,
    housingOwned: (input.housingOwned || 'unknown') as HousingOwned,
    saleBudget:
      input.saleBudget === '' || input.saleBudget == null ? null : Number(input.saleBudget),
    depositBudget:
      input.depositBudget === '' || input.depositBudget == null
        ? null
        : Number(input.depositBudget),
    monthlyBudget:
      input.monthlyBudget === '' || input.monthlyBudget == null
        ? null
        : Number(input.monthlyBudget),
  };
  if (
    result.regions.some((r) => !REGIONS.includes(r)) ||
    result.types.some((t) => !['sale', 'rental', 'officetel'].includes(t))
  )
    throw new Error('지역 또는 주거유형을 확인해 주세요.');
  if (!['yes', 'no', 'unknown'].includes(result.housingOwned))
    throw new Error('주택 보유 여부를 확인해 주세요.');
  if (
    result.birthDate &&
    (!dateOnly(result.birthDate) || result.birthDate > today || result.birthDate < '1900-01-01')
  )
    throw new Error('생년월일을 확인해 주세요.');
  for (const name of ['saleBudget', 'depositBudget', 'monthlyBudget'] as const) {
    if (
      result[name] !== null &&
      (!Number.isFinite(result[name]) ||
        result[name] < 0 ||
        result[name] > 10000000000 ||
        !Number.isInteger(result[name]))
    )
      throw new Error('예산은 0 이상의 정수로 입력해 주세요.');
  }
  return result;
}
export function stage(notice: Notice, today = koreaToday()): NoticeStage {
  if (notice.cancelled) return 'cancelled';
  if (notice.deadline && notice.deadline < today) return 'closed';
  if (!notice.starts || !notice.deadline) return 'unknown';
  return notice.starts > today ? 'upcoming' : 'open';
}
function ageAt(birth: string, basis: string): number {
  let age = Number(basis.slice(0, 4)) - Number(birth.slice(0, 4));
  if (basis.slice(5) < birth.slice(5)) age--;
  return age;
}
export function matchNotice(
  notice: Notice,
  profile: Profile = {},
  today = koreaToday(),
): MatchResult {
  const reasons: string[] = [],
    missing: string[] = [],
    failed: string[] = [];
  const preference = comparePreferences(notice, profile);
  let score = preferenceScore(preference);
  reasons.push(
    ...preference.checks.filter((check) => check.state !== 'unset').map((check) => check.message),
  );
  // 운영 공고는 승인·완결된 규칙이 없으면 반드시 수동 확인으로 남깁니다.
  const rules = notice.rules ?? [];
  const evaluable = rules.filter((r) => r.approved && r.evidence && r.basisDate);
  for (const rule of evaluable) {
    if (rule.field === 'age') {
      if (!profile.birthDate) missing.push('생년월일');
      else {
        const age = ageAt(profile.birthDate, rule.basisDate);
        if (age < rule.min || age > rule.max)
          failed.push(`공고 기준일 연령 조건(${rule.min}~${rule.max}세) 확인 필요`);
        else reasons.push('예시 공고의 연령 조건과 일치해요');
      }
    } else if (rule.field === 'housingOwned') {
      if (!profile.housingOwned || profile.housingOwned === 'unknown')
        missing.push('본인 주택 보유 여부');
      else if (profile.housingOwned !== rule.equals)
        failed.push('예시 공고의 본인 주택 보유 조건과 다릅니다');
      else reasons.push('예시 공고의 본인 주택 보유 조건과 일치해요');
    }
  }
  let status: MatchStatus = 'review';
  if (failed.length) status = 'ineligible';
  else if (missing.length) status = 'missing';
  else if (
    notice.isDemo &&
    notice.rulesComplete &&
    evaluable.length &&
    evaluable.length === rules.length
  )
    status = 'demo-match';
  if (status === 'demo-match') score += 20;
  if (status === 'ineligible') score -= 20;
  return {
    preference,
    status,
    score,
    reasons: reasons.length ? reasons : ['조건을 입력하면 맞춤 이유를 확인할 수 있어요'],
    missing: [...new Set(missing)],
    failed,
    basisDate: evaluable[0]?.basisDate ?? null,
    stage: stage(notice, today),
  };
}
