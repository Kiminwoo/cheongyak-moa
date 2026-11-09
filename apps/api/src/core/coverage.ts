import type { CoverageUnit } from '@cheongyak-moa/contracts';
import { HOME_OPERATIONS } from './normalization.js';

export type UnitSpec = Pick<
  CoverageUnit,
  'sourceId' | 'unit' | 'label' | 'channel' | 'implemented' | 'scope'
>;
export const LH_CATEGORIES = ['05', '06', '13', '39'] as const;
export const COVERAGE_UNITS: UnitSpec[] = [
  ...HOME_OPERATIONS.map(([operation, , label]) => ({
    sourceId: 'applyhome' as const,
    unit: operation,
    label,
    channel: 'api' as const,
    implemented: true,
    scope: '표시된 모집공고일 기간 또는 날짜 제한 없는 목록 · 전국 기관 전체를 의미하지 않음',
  })),
  ...LH_CATEGORIES.map((category) => ({
    sourceId: 'lh' as const,
    unit: category,
    label: `LH 주거 공고 유형 ${category}`,
    channel: 'api' as const,
    implemented: true,
    scope: '선택한 공고게시 조회 기간의 목록 · 상세 접수일·가격 별도 확인',
  })),
  ...(['sh', 'gh', 'local'] as const).map((sourceId) => ({
    sourceId,
    unit: 'myhome-rental',
    label: '마이홈 공공임대 기관별 분류',
    channel: 'api' as const,
    implemented: true,
    scope: '마이홈 API 응답에 포함된 식별 가능한 기관만 · 자체 공고 전체 아님',
  })),
  ...(['sh', 'gh'] as const).map((sourceId) => ({
    sourceId,
    unit: 'official-board',
    label: '공식 모집 게시판',
    channel: 'web' as const,
    implemented: true,
    scope: '접근 정책 허용 시 분류별 페이지 한도 내 수집 · 첨부 문서 미해석',
  })),
  {
    sourceId: 'local',
    unit: 'agency-boards',
    label: '지방공사·지자체 자체 공고',
    channel: 'web',
    implemented: false,
    scope: '기관별 조사·접근 정책·고유번호·응답 명세 검증 후 순차 연동',
  },
];

export interface UnitAttempt {
  status: 'running' | 'success' | 'failed';
  fetchedCount: number;
  activeCount: number;
  from: string | null;
  to: string | null;
  startedAt: string;
  endedAt: string | null;
  lastSuccessAt: string | null;
  errorCode: string | null;
}
