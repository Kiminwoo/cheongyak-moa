import type { Notice, QualityIssue, QualitySummary } from '@cheongyak-moa/contracts';
import { dateOnly } from '@cheongyak-moa/domain';

export function inspectNotice(notice: Notice): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const add = (code: string, message: string, severity: QualityIssue['severity'] = 'warning') =>
    issues.push({ code, message, severity });
  if (!notice.id || !notice.sourceId || !notice.externalId || !notice.title?.trim())
    add('identity', '공고 식별정보 또는 공고명이 없습니다.', 'error');
  for (const field of ['announced', 'starts', 'deadline', 'winnerDate'] as const) {
    if (notice[field] != null && !dateOnly(notice[field]))
      add('invalid_date', '공고 날짜 형식이 유효하지 않습니다.', 'error');
  }
  if (notice.starts && notice.deadline && notice.starts > notice.deadline)
    add('date_order', '접수 종료일이 시작일보다 빠릅니다.', 'error');
  if (!notice.starts || !notice.deadline)
    add('schedule_missing', '접수 일정 일부가 없어 공식 원문 확인이 필요합니다.');
  if (!notice.announced) add('announcement_missing', '모집공고일이 확인되지 않았습니다.');
  if (!notice.sourceUrl) add('source_missing', '공식 공고 원문 URL이 확인되지 않았습니다.');
  if (!notice.region || notice.region === '미확인')
    add('region_missing', '공급 지역이 확인되지 않았습니다.');
  if (notice.priceWon == null && notice.depositWon == null)
    add('price_missing', '금액은 아직 제공되지 않았습니다. 0원으로 해석하지 마세요.');
  for (const schedule of notice.schedules || []) {
    if (schedule.start && schedule.end && schedule.start > schedule.end)
      add('supply_date_order', '공급유형별 접수 일정의 순서가 잘못되었습니다.', 'error');
  }
  return issues;
}

export function summarizeQuality(notices: Notice[]): QualitySummary {
  const collected = notices.filter((n) => !n.isDemo);
  return {
    total: collected.length,
    apiCount: collected.filter((n) => n.provenance?.method !== 'file-import').length,
    importedCount: collected.filter((n) => n.provenance?.method === 'file-import').length,
    needsReview: collected.filter((n) => n.quality?.length).length,
    missingSchedule: collected.filter((n) => !n.starts || !n.deadline).length,
    missingPrice: collected.filter((n) => n.priceWon == null && n.depositWon == null).length,
  };
}

export function assertNoSecrets(payload: unknown): void {
  let nodes = 0;
  const visit = (value: unknown, depth = 0): void => {
    if (++nodes > 100000 || depth > 24) throw new Error('응답 파일 구조가 너무 복잡합니다.');
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (
        /^(service_?key|authorization|access_?token|refresh_?token|password|api_?key|secret)$/i.test(
          key,
        )
      )
        throw new Error('인증키·토큰 등 비밀정보 항목이 있는 응답은 저장할 수 없습니다.');
      if (
        typeof child === 'string' &&
        /[?&](servicekey|service_key|api_key|access_token)=/i.test(child)
      )
        throw new Error('인증정보가 포함된 URL은 저장할 수 없습니다.');
      visit(child, depth + 1);
    }
  };
  visit(payload);
}
