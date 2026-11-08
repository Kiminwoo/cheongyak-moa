import type {
  Notice,
  Profile,
  PreferenceAssessment,
  PreferenceCheck,
} from '@cheongyak-moa/contracts';

export function comparePreferences(notice: Notice, profile: Profile): PreferenceAssessment {
  const checks: PreferenceCheck[] = [];
  const regions = profile.regions ?? [];
  checks.push({
    field: 'region',
    label: '관심 지역',
    state: !regions.length
      ? 'unset'
      : regions.includes(notice.region)
        ? 'matched'
        : ['전국', '미확인'].includes(notice.region)
          ? 'unknown'
          : 'mismatch',
    message: !regions.length
      ? '관심 지역을 설정해 주세요'
      : regions.includes(notice.region)
        ? '관심 지역에 있어요'
        : notice.region === '전국'
          ? '전국 공고 · 세부 공급 지역을 원문에서 확인해 주세요'
          : notice.region === '미확인'
            ? '공급 지역 미확인 · 원문 비교가 필요해요'
            : '관심 지역 밖의 공고예요',
  });
  const types = profile.types ?? [];
  checks.push({
    field: 'type',
    label: '주거유형',
    state: !types.length ? 'unset' : types.includes(notice.type) ? 'matched' : 'mismatch',
    message: !types.length
      ? '희망 주거유형을 설정해 주세요'
      : types.includes(notice.type)
        ? '선택한 주거유형이에요'
        : '선택한 주거유형과 달라요',
  });
  const budget = (
    field: 'price' | 'deposit' | 'monthly',
    label: string,
    amount: number | null,
    limit: number | null | undefined,
  ) => {
    const particle = label === '월 임대료' ? '가' : '이';
    checks.push({
      field,
      label,
      state:
        limit == null
          ? 'unset'
          : amount == null
            ? 'unknown'
            : amount <= limit * 10000
              ? 'matched'
              : 'mismatch',
      message:
        limit == null
          ? `${label} 예산을 설정해 주세요`
          : amount == null
            ? `${label} 미확인 · 예산 비교가 필요해요`
            : amount <= limit * 10000
              ? `${label}${particle} 입력 예산 이내예요`
              : `${label}${particle} 입력 예산을 초과해요`,
    });
  };
  if (notice.type === 'rental') {
    budget('deposit', '보증금', notice.depositWon, profile.depositBudget);
    budget('monthly', '월 임대료', notice.monthlyWon, profile.monthlyBudget);
  } else budget('price', '표시 가격', notice.priceWon, profile.saleBudget);
  const active = checks.filter((check) => check.state !== 'unset');
  const state = active.some((check) => check.state === 'mismatch')
    ? 'mismatch'
    : active.some((check) => check.state === 'unknown')
      ? 'unknown'
      : active.length
        ? 'matched'
        : 'unset';
  return { state, checks };
}

export function preferenceScore(preference: PreferenceAssessment): number {
  return preference.checks.reduce((score, check) => {
    const weight = check.field === 'region' ? 30 : check.field === 'type' ? 15 : 10;
    return score + (check.state === 'matched' ? weight : check.state === 'mismatch' ? -weight : 0);
  }, 0);
}
