import { koreaToday } from '@cheongyak-moa/domain';
export function demoNotices(today = koreaToday()) {
  const day = (offset) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
  const definitions = [
    ['01', '서울', '마포', '마포 숲길 청년주택', 'rental', '행복주택', 36, null, 48000000, 240000, -3, 3, 'LH', true],
    ['02', '경기', '성남', '판교 가든 신혼희망타운', 'sale', '공공분양', 59, 620000000, null, null, -1, 6, 'LH', false],
    ['03', '인천', '연수', '송도 리버파크', 'sale', '민영분양', 84, 780000000, null, null, 4, 8, '청약홈', false],
    ['04', '서울', '강동', '강동 봄빛 매입임대', 'rental', '청년 매입임대', 29, null, 20000000, 180000, -2, 1, 'SH', true],
    ['05', '경기', '수원', '광교 호수마을 국민임대', 'rental', '국민임대', 46, null, 52000000, 320000, 2, 12, 'LH', false],
    ['06', '부산', '해운대', '해운대 센트럴 오피스텔', 'officetel', '오피스텔', 49, 310000000, null, null, -2, 5, '청약홈', false],
    ['07', '대전', '유성', '유성 온빛 통합공공임대', 'rental', '통합공공임대', 44, null, 36000000, 210000, -4, 4, 'LH', false],
    ['08', '경기', '화성', '동탄 어울림 잔여세대', 'sale', '무순위·잔여세대', 59, 490000000, null, null, 6, 7, '청약홈', false],
    ['09', '세종', '다정', '세종 다정마을 공공분양', 'sale', '공공분양', 74, 460000000, null, null, -10, -2, 'LH', false]
  ];
  return definitions.map(([id, region, city, title, type, subtype, area, priceWon, depositWon, monthlyWon, start, end, source, youth]) => ({
    id: `demo-${id}`, sourceId: `demo-${source}`, externalId: id, title: `${title} (예시)`, region, city,
    address: `${region} ${city} · 위치 설명용 예시`, type, subtype, area, areaBasis: '전용 · 예시', priceWon, depositWon, monthlyWon,
    priceBasis: '화면·매칭 검증용 가상 금액', starts: day(start), deadline: day(end), announced: day(-12), winnerDate: day(end + 10), units: Number(id) * 32 + 20,
    source, sourceUrl: null, isDemo: true, rulesComplete: youth, cancelled: false,
    description: '실제 모집공고가 아닙니다. 이름·물량·금액·일정·조건은 기능 검증을 위해 만든 가상 데이터이며 청약 신청에 사용할 수 없습니다.',
    rules: youth ? [
      { field: 'age', min: 19, max: 39, basisDate: day(-12), approved: true, evidence: '가상 공고의 테스트 규칙. 실제 공급제도의 기준이 아닙니다.' },
      { field: 'housingOwned', equals: 'no', basisDate: day(-12), approved: true, evidence: '본인 보유 여부만 비교하는 테스트 규칙. 세대 무주택 자격을 판정하지 않습니다.' }
    ] : []
  }));
}
