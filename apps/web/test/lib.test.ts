import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNotices,defaultFilters,money,calendarCells,shiftMonth,calendarFile,deadlineText } from '../src/lib.js';
import { demoNotices } from '../../api/src/core/demo.js';
import { matchNotice } from '@cheongyak-moa/domain';
const today='2026-11-08';
const notices=demoNotices(today).map(n=>({...n,match:matchNotice(n,{},today)}));
test('프런트 검색은 지역·검색어·마감·데이터 구분을 함께 적용한다',()=>{
  assert.equal(selectNotices(notices,defaultFilters,'matching').length,8);
  assert.equal(selectNotices(notices,{...defaultFilters,region:'서울'},'matching').length,2);
  assert.equal(selectNotices(notices,{...defaultFilters,search:'송도'},'matching')[0].region,'인천');
  assert.equal(selectNotices(notices,{...defaultFilters,dataMode:'live'},'matching').length,0);
  assert.equal(selectNotices(notices,{...defaultFilters,includeClosed:true},'matching').length,9);
});
test('관심 목록과 자격 상태 필터는 원본 데이터를 바꾸지 않는다',()=>{
  const input=notices.map((n,i)=>({...n,favorite:i===0}));
  const before=JSON.stringify(input);
  assert.equal(selectNotices(input,defaultFilters,'favorites').length,1);
  assert.equal(selectNotices(input,{...defaultFilters,status:'missing'},'matching').length,2);
  assert.equal(JSON.stringify(input),before);
});
test('미확인 마감일은 임박순 정렬 뒤에 남는다',()=>{
  const missing={...notices[0],id:'missing',deadline:null};
  const list=selectNotices([...notices,missing],{...defaultFilters,sort:'deadline'},'all');
  assert.equal(list.at(-1).id,'missing');assert.equal(deadlineText(missing,today),'접수일 원문 확인');
});
test('표시 금액은 0원과 미확인 금액을 구분한다',()=>{
  assert.equal(money(null),'금액 미확인');assert.equal(money(0),'0원');assert.equal(money(620000000),'6억 2,000만원');
});
test('캘린더는 월 경계·윤년·시작일과 마감일을 처리한다',()=>{
  assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');
  assert.equal(calendarCells('2024-02',[]).filter(Boolean).length,29);
  const cells=calendarCells('2026-11',notices);assert.equal(cells.length%7,0);
  assert.ok(cells.some(c=>c?.events.some(e=>e.n.id==='demo-01'&&e.end)));
});
test('일정 내보내기는 종료일 다음 날과 가상 표시를 포함한다',()=>{
  const ics=calendarFile(notices[0],new Date('2026-11-08T00:00:00Z'));
  assert.match(ics,/DTEND;VALUE=DATE:20261112/);assert.match(ics,/\[가상 예시\]/);assert.match(ics,/DTSTAMP:20261108T000000Z/);
  assert.throws(()=>calendarFile({...notices[0],deadline:null}));
});
