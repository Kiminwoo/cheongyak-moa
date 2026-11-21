import React from 'react';
import type { AptResults } from '@cheongyak-moa/contracts';

type TableRow = { key: string; cells: (string | null)[] };

function ResultTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: TableRow[];
}) {
  return (
    <details>
      <summary>{title}</summary>
      {rows.length ? (
        <div className="table-scroll">
          <table className="source-table" aria-label={title}>
            <thead>
              <tr>
                {columns.map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, cells }) => (
                <tr key={key}>
                  {cells.map((cell, index) => (
                    <td key={columns[index]}>{cell ?? '미제공'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>청약홈에서 제공한 자료가 없습니다.</p>
      )}
    </details>
  );
}

export default function NoticeResults({ results }: { results: AptResults }) {
  return (
    <section className="detail-section" aria-label="청약홈 접수 및 당첨 결과">
      <h3>청약홈 접수 및 당첨 결과</h3>
      <p>
        출처 한국부동산원 청약홈 ·{' '}
        {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(
          new Date(results.checkedAt),
        )}{' '}
        수집. 접수건수는 추후 일부 변동될 수 있습니다.
      </p>
      <ResultTable
        title="일반공급 경쟁률"
        columns={['주택형', '순위', '거주구분', '공급세대', '접수건수', '경쟁률']}
        rows={results.competition.map((row) => ({
          key: JSON.stringify([row.model, row.rank, row.region]),
          cells: [row.housingType, row.rank, row.region, row.units, row.applications, row.rate],
        }))}
      />
      <ResultTable
        title="당첨 가점"
        columns={['주택형', '거주구분', '최저', '최고', '평균']}
        rows={results.scores.map((row) => ({
          key: JSON.stringify([row.model, row.region]),
          cells: [row.housingType, row.region, row.low, row.high, row.average],
        }))}
      />
      <ResultTable
        title="특별공급 신청현황"
        columns={[
          '주택형',
          '공급유형',
          '배정세대',
          '해당지역 신청',
          '기타경기 신청',
          '기타지역 신청',
          '접수건수',
          '예비자 접수',
        ]}
        rows={results.special.map((row) => ({
          key: JSON.stringify([row.housingType, row.category]),
          cells: [
            row.housingType,
            row.category,
            row.units,
            row.local,
            row.otherGyeonggi,
            row.other,
            row.applications,
            row.reserveApplications,
          ],
        }))}
      />
    </section>
  );
}
