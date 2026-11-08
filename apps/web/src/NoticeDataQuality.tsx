import type { MatchedNotice } from '@cheongyak-moa/contracts';
import React from 'react';
import { shortDate } from './lib.js';
export default function NoticeDataQuality({ notice: n }: { notice: MatchedNotice }) {
  const schedules = n.schedules ?? [];
  const quality = n.quality ?? [];
  return (
    <>
      {n.provenance && (
        <section className="detail-section">
          <h3>출처와 검수 상태</h3>
          <p>
            {n.provenance.method === 'file-import'
              ? '외부 JSON 파일에서 가져온 자료입니다. 출처의 진위와 최신 여부는 검증되지 않았습니다.'
              : n.provenance.method === 'web'
                ? '기관 공식 게시판에서 수집한 모집공고입니다. 첨부 원문의 일정·금액·자격 대조 검수는 완료되지 않았습니다.'
                : '공식 API 응답을 정규화한 자료입니다. 공고 원문과의 대조 검수는 아직 완료되지 않았습니다.'}
          </p>
          {n.provenance.method === 'web' && n.publicationDate && (
            <p>
              게시판 등록일: {n.publicationDate} · 신청 자격 기준일은 공고 원문을 확인해 주세요.
            </p>
          )}
          {n.provider === 'myhome' && (
            <p>
              공급기관: {n.issuerName} · 수집 경로: 마이홈 공공주택 모집공고 API. 해당 기관
              홈페이지의 모든 공고를 수집한 것은 아닙니다.
            </p>
          )}
        </section>
      )}
      {schedules.length > 0 && (
        <section className="detail-section">
          <h3>공급유형별 접수 일정</h3>
          <ul>
            {schedules.map((s, i) => (
              <li key={i}>
                {s.label} · {shortDate(s.start)} ~ {shortDate(s.end)}
              </li>
            ))}
          </ul>
          <p>날짜 범위이며 접수 마감시간은 원문을 확인해 주세요.</p>
        </section>
      )}
      {quality.length > 0 && (
        <section className="detail-section">
          <h3>추가 확인할 데이터</h3>
          <ul>
            {quality.map((q, i) => (
              <li key={i}>{q.message}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
