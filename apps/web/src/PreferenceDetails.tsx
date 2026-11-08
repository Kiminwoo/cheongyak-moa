import React from 'react';
import type { PreferenceAssessment, PreferenceState } from '@cheongyak-moa/contracts';

export const preferenceLabels: Record<PreferenceState, string> = {
  matched: '입력한 선호 조건 일치',
  mismatch: '선호 조건 일부 불일치',
  unknown: '선호 조건 비교 · 원문 확인 필요',
  unset: '선호 조건을 설정해 주세요',
};
const checkLabels: Record<PreferenceState, string> = {
  matched: '일치',
  mismatch: '불일치',
  unknown: '확인 필요',
  unset: '미입력',
};
export default function PreferenceDetails({ assessment }: { assessment: PreferenceAssessment }) {
  return (
    <section className="detail-section" aria-label="선호 조건 비교">
      <h3>지역·유형·예산 비교</h3>
      <p>{preferenceLabels[assessment.state]}</p>
      <ul className="preference-checks">
        {assessment.checks.map((check) => (
          <li key={check.field}>
            <div>
              <strong>{check.label}</strong>
              <span className={`preference-state ${check.state}`}>{checkLabels[check.state]}</span>
            </div>
            <p>{check.message}</p>
          </li>
        ))}
      </ul>
      <p>
        입력한 선호와 공고의 표시 정보를 비교합니다. 신청 자격이나 대출 가능액을 뜻하지 않으며,
        주택형별 실제 금액과 세부 공급 지역은 공고 원문을 확인해 주세요.
      </p>
    </section>
  );
}
