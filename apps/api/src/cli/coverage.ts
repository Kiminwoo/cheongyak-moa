import { Store } from '../core/store.js';
import { projectRoot, dataPaths } from '../paths.js';
const store = new Store(dataPaths(projectRoot(import.meta.url)).database, { seed: false });
try {
  console.log('기관·유형별 수집 범위 · 외부 API 요청 없음 · 전체 연동 완료 아님');
  for (const unit of store.coverage())
    console.log(
      `${unit.sourceId}/${unit.unit}: ${unit.status} · 조회 ${unit.fetchedCount ?? '-'}행 · 활성 ${unit.activeCount ?? '-'}건 · ${unit.from && unit.to ? `${unit.from}~${unit.to}` : '기간 제한 별도'} · 최근 성공 ${unit.lastSuccessAt ?? '검증 이력 없음'}${unit.errorCode ? ` · ${unit.errorCode}` : ''}`,
    );
  console.log(
    '마이홈 조회 행수는 공통 API 응답 기준이며 기관별 합산 대상이 아닙니다. 이전 버전 수집 실적을 새 유형의 검증 실적으로 소급하지 않습니다.',
  );
} finally {
  store.close();
}
