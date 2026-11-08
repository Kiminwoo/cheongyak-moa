import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dateOnly, koreaToday, regionName } from './matching.js';

const HOME_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/';
export const HOME_OPERATIONS = [
  ['getAPTLttotPblancDetail', 'sale', 'APT 분양'],
  ['getRemndrLttotPblancDetail', 'sale', '무순위·잔여세대'],
  ['getUrbtyOfctlLttotPblancDetail', 'officetel', '오피스텔·도시형·민간임대']
];
function keyValue(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}
export async function getJSON(url, fetchFn = fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
      if (!res.ok) {
        if (res.status < 500 && res.status !== 429) throw Object.assign(new Error('공식 API 인증·승인 상태 또는 요청 명세를 확인해 주세요.'), { stop: true });
        throw new Error('upstream');
      }
      try { return await res.json(); } catch { throw Object.assign(new Error('공식 API가 JSON 대신 다른 응답을 반환했습니다. 인증키와 승인 상태를 확인해 주세요.'), { stop: true }); }
    } catch (error) {
      if (error.stop) throw error;
      if (attempt === 2) throw new Error('공식 API 응답 실패 또는 시간 초과. 기존 공고는 유지됩니다.');
      await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
}
const base = { isDemo: false, rules: [], rulesComplete: false, priceWon: null, depositWon: null, monthlyWon: null, area: null, areaBasis: null, priceBasis: '목록 API에는 확정 가격 없음 · 원문 확인', description: '공식 목록 API 수집 자료입니다. 주택형별 가격·상세 접수시간·자격·정정사항은 공식 공고문에서 확인해 주세요.' };
function safeLink(value) { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : null; } catch { return null; } }
function units(value) { const n = Number(String(value ?? '').replaceAll(',', '')); return value != null && value !== '' && Number.isInteger(n) && n >= 0 ? n : null; }
export function normalizeHome(row, operation, type, subtype) {
  if (!row.HOUSE_MANAGE_NO || !row.PBLANC_NO || !row.HOUSE_NM) throw new Error('청약홈 응답의 필수 식별자 또는 공고명이 없습니다. 명세 확인이 필요합니다.');
  const rental = String(row.RENT_SECD_NM ?? row.HOUSE_SECD_NM ?? '').includes('임대') || row.SEARCH_HOUSE_SECD === '0203';
  return { ...base, id: `applyhome:${operation}:${row.HOUSE_MANAGE_NO}:${row.PBLANC_NO}`, sourceId: 'applyhome', externalId: `${row.HOUSE_MANAGE_NO}:${row.PBLANC_NO}`, operation,
    title: row.HOUSE_NM, source: '청약홈', region: regionName(row.SUBSCRPT_AREA_CODE_NM || row.HSSPLY_ADRES), city: '', address: row.HSSPLY_ADRES || '주소 미확인',
    type: rental ? 'rental' : type, subtype: row.HOUSE_DTL_SECD_NM || row.HOUSE_SECD_NM || subtype,
    announced: dateOnly(row.RCRIT_PBLANC_DE), starts: dateOnly(row.RCEPT_BGNDE || row.SUBSCRPT_RCEPT_BGNDE || row.GNRL_RCEPT_BGNDE), deadline: dateOnly(row.RCEPT_ENDDE || row.SUBSCRPT_RCEPT_ENDDE || row.GNRL_RCEPT_ENDDE),
    winnerDate: dateOnly(row.PRZWNER_PRESNATN_DE), units: units(row.TOT_SUPLY_HSHLDCO), sourceUrl: safeLink(row.PBLANC_URL), cancelled: false };
}
export function normalizeLH(row) {
  if (!row.PAN_NM || !row.DTL_URL) throw new Error('LH 응답의 공고명 또는 상세 URL이 없습니다. 명세 확인이 필요합니다.');
  const link = safeLink(row.DTL_URL);
  if (!link) throw new Error('LH 상세 URL이 유효하지 않습니다.');
  const found = /PAN_ID[:=]([A-Za-z0-9_-]+)/.exec(decodeURIComponent(link));
  const externalId = String(row.PAN_ID || found?.[1] || '');
  if (!externalId) throw new Error('LH 고유 공고번호를 확인할 수 없습니다. 중복 방지를 위해 수집을 중단했습니다.');
  return { ...base, id: `lh:${externalId}`, sourceId: 'lh', externalId, title: row.PAN_NM, source: 'LH', region: regionName(row.CNP_CD_NM), city: '', address: row.CNP_CD_NM || '지역 미확인',
    type: String(row.UPP_AIS_TP_CD) === '05' || String(row.UPP_AIS_TP_CD) === '39' || String(row.UPP_AIS_TP_NM).includes('분양') ? 'sale' : 'rental', subtype: row.AIS_TP_CD_NM || row.UPP_AIS_TP_NM || '분양·임대',
    announced: dateOnly(row.PAN_NT_ST_DT || row.PAN_NT_DT), starts: null, deadline: null, winnerDate: null, units: null, sourceUrl: link,
    // 공고게시 종료일(CLSG_DT)은 청약 접수 마감일이 아니므로 접수일에 매핑하지 않습니다.
    publicationEnd: dateOnly(row.CLSG_DT), sourceStatus: row.PAN_SS || null, cancelled: String(row.PAN_SS).includes('취소') };
}
export function lhRows(payload) {
  const entries = Array.isArray(payload) ? payload : [payload];
  for (const entry of entries) {
    if (entry?.SS_CODE && entry.SS_CODE !== 'Y') throw new Error('LH API 오류 응답. 인증·승인 상태와 명세를 확인해 주세요.');
    for (const info of entry?.dsSch ?? []) if (info.SS_CODE && info.SS_CODE !== 'Y') throw new Error('LH API 오류 응답. 인증·승인 상태와 명세를 확인해 주세요.');
  }
  const found = entries.find(entry => Array.isArray(entry?.dsList));
  if (!found) throw new Error('LH API 응답 형식이 예상과 다릅니다. 기존 데이터는 유지됩니다.');
  return found.dsList;
}
function rawSave(rawDir, source, runId, name, payload) {
  const folder = join(rawDir, source, String(runId)); mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${name}.json`), JSON.stringify(payload, null, 2));
}
export async function collect(store, { env = process.env, rawDir = 'data/raw', fetchFn = fetch, today = koreaToday() } = {}) {
  const lookback = Math.min(3650, Math.max(1, Number(env.COLLECT_LOOKBACK_DAYS) || 180));
  const before = new Date(`${today}T00:00:00Z`); before.setUTCDate(before.getUTCDate() - lookback);
  const from = before.toISOString().slice(0,10), results = [];
  for (const source of ['applyhome','lh']) {
    const key = env[source === 'applyhome' ? 'APPLYHOME_SERVICE_KEY' : 'LH_SERVICE_KEY'];
    if (!key) { results.push({ source, status: 'unconfigured', count: 0, message: '인증키 미설정' }); continue; }
    const run = store.beginRun(source); let count = 0;
    try {
      if (source === 'applyhome') {
        for (const [operation,type,subtype] of HOME_OPERATIONS) {
          let complete = false;
          for (let page = 1; page <= 100; page++) {
            const url = new URL(HOME_BASE + operation);
            url.searchParams.set('serviceKey',keyValue(key)); url.searchParams.set('page',String(page)); url.searchParams.set('perPage','100'); url.searchParams.set('cond[RCRIT_PBLANC_DE::GTE]',from);
            const payload = await getJSON(url,fetchFn);
            // 원본 파일에 요청 URL/인증키를 기록하지 않습니다.
            if (!Array.isArray(payload.data)) throw new Error('청약홈 API 응답 형식이 예상과 다릅니다. 인증·승인 상태를 확인해 주세요.');
            rawSave(rawDir,source,run,`${operation}-${page}`,payload);
            for (const row of payload.data) { store.upsert(normalizeHome(row,operation,type,subtype)); count++; }
            const total = Number(payload.matchCount ?? payload.totalCount);
            if (payload.data.length < 100 || (Number.isFinite(total) && page * 100 >= total)) { complete = true; break; }
          }
          if (!complete) throw new Error('페이지 제한에 도달했습니다. 수집 기간을 나눠 다시 실행해 주세요.');
        }
      } else {
        // 주거용 공고만 조회. 토지·상가는 이번 버전에 포함하지 않습니다.
        for (const category of ['05','06','13','39']) {
          let complete = false;
          for (let page = 1; page <= 100; page++) {
            const url = new URL('https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1');
            for (const [k,v] of Object.entries({ ServiceKey:keyValue(key), PG_SZ:'100', PAGE:String(page), UPP_AIS_TP_CD:category, PAN_NT_ST_DT:from.replaceAll('-','.'), CLSG_DT:today.replaceAll('-','.') })) url.searchParams.set(k,v);
            const payload = await getJSON(url,fetchFn), rows = lhRows(payload);
            rawSave(rawDir,source,run,`${category}-${page}`,payload);
            for (const row of rows) { store.upsert(normalizeLH({ ...row, UPP_AIS_TP_CD: row.UPP_AIS_TP_CD ?? category })); count++; }
            if (rows.length < 100) { complete = true; break; }
          }
          if (!complete) throw new Error('페이지 제한에 도달했습니다. 수집 기간을 나눠 다시 실행해 주세요.');
        }
      }
      const message = `최근 ${lookback}일 범위 ${count}건 처리. 상세 조건·최신 정정 여부는 원문 확인이 필요합니다.`;
      store.finishRun(run,'success',count,message); results.push({ source,status:'success',count,message });
    } catch (error) {
      // 외부 예외에는 URL/인증키가 포함될 수 있으므로 알려진 문구만 공개합니다.
      const known = /^(공식 API|청약홈|LH |페이지 제한)/.test(error.message);
      const message = known ? error.message : '수집 또는 저장에 실패했습니다. 기존 공고는 보존되었습니다.';
      store.finishRun(run,'failed',count,message); results.push({ source,status:'failed',count,message });
    }
  }
  return results;
}
