import { errorMessage } from '@cheongyak-moa/contracts';
import type { BootstrapData, ImportInput } from '@cheongyak-moa/contracts';
import type { FormEvent } from 'react';
import React, { useState } from 'react';
import { dateTime } from './lib.js';

export default function DataConnections({data,onCollect,onRefresh,onImport,onSetup,offline,busy}: {data: BootstrapData;onCollect: ()=>void;onRefresh: ()=>void;onImport: (payload: ImportInput)=>Promise<void>;onSetup: ()=>void;offline: boolean;busy: boolean}) {
  const connection=data.connection,quality=data.quality;
  const [format,setFormat]=useState('applyhome-apt'),[file,setFile]=useState<File|null>(null),[importing,setImporting]=useState(false),[error,setError]=useState('');
  const disabled=offline||busy||data.collecting||importing;
  async function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setError('');
    if(!file){setError('API 응답 JSON 파일을 선택해 주세요.');return;}
    if(file.size>(connection?.maxImportBytes||1048576)){setError('1MiB 이하의 JSON 파일만 가져올 수 있습니다.');return;}
    setImporting(true);
    try {
      let payload;
      try{payload=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{throw new Error('JSON 파일 형식이 올바르지 않습니다.');}
      await onImport({format,payload});
    } catch(e){setError(errorMessage(e));} finally{setImporting(false);}
  }
  return <section id="sources-panel">
    {!connection&&<div className="detail-alert">새 데이터 연결 기능을 사용하려면 로컬 서버를 재시작해 주세요.</div>}
    <div className="connection-steps">
      <p className="eyebrow">CONNECT OFFICIAL DATA</p><h3>공식 데이터를 연결하는 첫 단계</h3>
      <ol><li>아래 기관별 공식 페이지에서 API 활용 신청</li><li><code>.env</code> 파일에 일반 인증키(Decoding) 입력</li><li>서버 재시작 후 수집 실행, 공고 원문과 내용 대조</li></ol>
      <p className="helper">인증키는 이 화면에 입력하지 않습니다. 파일 생성 버튼은 기존 .env를 덮어쓰지 않아요.</p>
      <div className="source-actions"><button className="secondary" disabled={offline||busy||!connection} onClick={onSetup}>{connection?.environment?.exists?'.env 상태 확인':'빈 .env 설정 파일 만들기'}</button><span className="helper">{connection?.environment?.restartRequired?'설정 파일 변경 감지 · 서버 재시작 필요':connection?.environment?.exists?'설정 파일 있음 · 키 값은 비공개':'설정 파일 미생성'}</span></div>
    </div>
    {connection?.error&&<p className="form-error" role="alert">{connection.error}</p>}
    <p className="source-intro">{connection&&<>수집 설정: {connection.from}~{connection.to} · 최근 {connection.lookbackDays}일<br/></>}API 응답을 받았다는 사실은 공고 내용을 검수했다는 의미가 아닙니다. 현재 전국 모든 기관이 연동된 상태는 아닙니다.</p>
    {quality&&<div className="quality-grid" aria-label="데이터 품질 현황">{[['API 수집',quality.apiCount],['파일 가져오기',quality.importedCount],['확인할 공고',quality.needsReview],['접수일 미확인',quality.missingSchedule]].map(([label,count])=><div key={label}><span>{label}</span><strong>{count}<small>건</small></strong></div>)}</div>}
    <div className="table-scroll"><table className="source-table"><thead><tr><th>출처·활용 신청</th><th>대상</th><th>API 연결 상태</th><th>공고</th></tr></thead><tbody>{data.sources.map(s=>{
      const latest=data.runs.find(r=>r.sourceId===s.id&&r.method!=='file-import');
      const status=s.status==='planned'?'연동 예정':!s.configured?'인증키 미설정':latest?.status==='success'?'API 응답 수신':latest?.status==='failed'?'수집 실패':latest?.status==='running'?'수집 중':'키 설정 · 승인 확인 전';
      const imported=data.notices.filter(n=>!n.isDemo&&n.sourceId===s.id&&n.provenance?.method==='file-import').length;
      return <tr key={s.id}><td>{s.url?<a href={s.url} target="_blank" rel="noopener noreferrer">{s.name} ↗</a>:s.name}</td><td>{s.scope}</td><td><span className={`badge ${latest?.status==='success'?'green':'gray'}`}>{status}</span><small>{latest?dateTime(latest.startedAt):'API 수집 이력 없음'}</small></td><td>API {s.count-imported}건<small>파일 {imported}건</small></td></tr>;
    })}</tbody></table></div>
    <div className="source-actions"><button className="primary" disabled={disabled||!!connection?.error} onClick={onCollect}>{data.collecting?'공식 공고 수집 중…':'공식 공고 수집 실행'}</button><button className="secondary" disabled={disabled} onClick={onRefresh}>상태 새로고침</button></div>
    <details className="detail-section"><summary>응답 JSON 파일 가져오기</summary>
      <p>공식 API에서 직접 받은 목록 응답을 가져올 수 있어요. 파일 내용의 출처는 자동 인증하지 않으며, 가져온 공고에는 ‘파일·미검수’로 표시합니다. 인증키가 포함된 파일은 거부합니다.</p>
      <form onSubmit={importFile} aria-label="API 응답 가져오기"><label className="field-label" htmlFor="import-format">응답 종류</label><select id="import-format" value={format} onChange={e=>setFormat(e.target.value)} disabled={disabled||!connection}>{connection?.importFormats?.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select><label className="field-label" htmlFor="import-file">목록 응답 파일 · JSON, 최대 1MiB</label><input id="import-file" className="file-input" type="file" accept=".json,application/json" disabled={disabled||!connection} onChange={e=>setFile(e.target.files?.[0]||null)}/><div className="source-actions"><button className="secondary" disabled={disabled||!connection} type="submit">{importing?'검증·저장 중…':'검증 후 가져오기'}</button></div>{error&&<p className="form-error" role="alert">{error}</p>}</form>
    </details>
    <h3 className="section-subtitle">최근 수집·가져오기 이력</h3>{data.runs.length?data.runs.map(r=><div className="run" key={r.id}><strong>{r.sourceId==='applyhome'?'청약홈':'LH'}</strong><span>{r.method==='file-import'?'파일 가져오기':'API 수집'} · {{running:'진행 중',success:'완료',failed:'실패'}[r.status]||r.status} · {r.count}건 처리</span><small>{dateTime(r.startedAt)} · {r.message||'응답 대기 중'}{r.warnings>0&&` · 확인 항목 ${r.warnings}개`}</small></div>):<p className="source-intro">아직 수집 이력이 없어요. 예시 공고는 수집 실적에 포함하지 않습니다.</p>}
  </section>;
}
