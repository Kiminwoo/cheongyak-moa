import React from 'react';
import type { Notice } from '@cheongyak-moa/contracts';
import { money } from './lib.js';

export function supplyPriceText(notice: Notice): string {
  const amounts =
    notice.pricing?.models
      .map((model) => model.maximumWon)
      .filter((amount): amount is number => amount != null) ?? [];
  if (!amounts.length) return money(notice.priceWon);
  const min = Math.min(...amounts),
    max = Math.max(...amounts);
  return min === max ? money(min) : `${money(min)} ~ ${money(max)}`;
}
export default function SupplyPrices({ notice }: { notice: Notice }) {
  if (!notice.pricing?.models.length) return null;
  return (
    <section className="detail-section" aria-label="주택형별 공급 가격">
      <h3>주택형별 공급 최고금액</h3>
      <p>
        각 주택형의 최고금액입니다. 카드의 범위는 주택형별 최고금액 중 최저~최고이며 실제 최저
        분양가를 뜻하지 않습니다. 층별 금액·발코니 확장·유상 옵션 등은 원문을 확인해 주세요.
      </p>
      <div className="table-scroll">
        <table className="source-table">
          <thead>
            <tr>
              <th>주택형·타입</th>
              <th>면적(㎡·API)</th>
              <th>공급세대</th>
              <th>공급 최고금액</th>
            </tr>
          </thead>
          <tbody>
            {notice.pricing.models.map((model) => (
              <tr key={model.model}>
                <td>{model.housingType}</td>
                <td>{model.supplyArea ?? '미제공'}</td>
                <td>{model.units ?? '미제공'}</td>
                <td>{money(model.maximumWon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>{notice.priceBasis}</p>
    </section>
  );
}
