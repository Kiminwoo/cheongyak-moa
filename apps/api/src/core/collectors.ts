import { isRecord, errorCode } from '@cheongyak-moa/contracts';
import type { Environment, Notice, CollectionResult, FetchJSON } from '@cheongyak-moa/contracts';
import type { Store } from './store.js';
import { createHash } from 'node:crypto';
import { koreaToday } from '@cheongyak-moa/domain';
import { HOME_BASE, HOME_OPERATIONS, IMPORT_FORMATS, lhRows } from './normalization.js';
import { collectionConfig } from './config.js';
import { preparePayload, saveRaw } from './ingestion.js';
export { HOME_OPERATIONS, normalizeHome, normalizeLH, lhRows } from './normalization.js';

function keyValue(value: string): string { try { return decodeURIComponent(value.trim()); } catch { return value.trim(); } }
const failureMessages: Record<string,string> = {
  network_denied:'실행 환경에서 공식 API 접속이 차단되었습니다. 네트워크 권한을 확인해 주세요.',
  authentication:'공식 API 인증·활용 승인 상태를 확인해 주세요.',
  invalid_response:'공식 API 응답 형식 또는 날짜·페이지 구성을 확인해 주세요.',
  timeout:'공식 API 응답 지연 또는 연결 실패입니다. 잠시 후 다시 시도해 주세요.'
};

export async function getJSON(url: URL, fetchFn: FetchJSON = fetch): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchFn(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
      if (!response.ok) {
        if ((response.status ?? 0) < 500 && response.status !== 429) throw Object.assign(new Error('공식 API 인증·승인 상태 또는 요청 명세를 확인해 주세요.'), { stop: true,publicCode:'authentication' });
        throw new Error('upstream');
      }
      try { return await response.json(); }
      catch { throw Object.assign(new Error('공식 API가 JSON을 반환하지 않았습니다.'), { stop: true,publicCode:'invalid_response' }); }
    } catch (error) {
      if (isRecord(error) && error.stop) throw error;
      if (attempt === 2) throw Object.assign(new Error('공식 API 응답 실패'),{publicCode:['EACCES','EPERM'].includes(errorCode(isRecord(error) ? error.cause : undefined) || errorCode(error))?'network_denied':'timeout'});
      await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
}

function checkPage(rows: unknown[], fingerprints: Set<string>) {
  if (!rows.length) return;
  const fingerprint = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  if (fingerprints.has(fingerprint)) throw new Error('공식 API가 같은 페이지를 반복해서 반환했습니다. 기존 데이터는 유지됩니다.');
  fingerprints.add(fingerprint);
}
function stageNotices(staged: Map<string,Notice>, notices: Notice[]) {
  for (const notice of notices) {
    const existing = staged.get(notice.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(notice)) throw new Error('공식 API 수집 중 같은 공고의 내용이 달라졌습니다. 다시 시도해 주세요.');
    staged.set(notice.id, notice);
  }
}

export async function collect(store: Store, { env = process.env, rawDir = 'data/raw', fetchFn = fetch, today = koreaToday() }: {env?: Environment; rawDir?: string; fetchFn?: FetchJSON; today?: string} = {}): Promise<CollectionResult[]> {
  const config = collectionConfig(env, today);
  const results: CollectionResult[] = [];
  for (const source of ['applyhome', 'lh'] as const) {
    if (!config.configured[source]) { results.push({ source, status: 'unconfigured', count: 0, message: '인증키 미설정' }); continue; }
    const key = keyValue(env[source === 'applyhome' ? 'APPLYHOME_SERVICE_KEY' : 'LH_SERVICE_KEY'] || '');
    const run = store.beginRun(source, 'api');
    const staged = new Map<string,Notice>();
    try {
      if (source === 'applyhome') {
        for (const [operation] of HOME_OPERATIONS) {
          const format = IMPORT_FORMATS.find(f => f.operation === operation)!.id;
          const fingerprints = new Set<string>();
          let complete = false;
          for (let page = 1; page <= 100; page++) {
            const url = new URL(HOME_BASE + operation);
            for (const [k,v] of Object.entries({ serviceKey:key, page:String(page), perPage:'100', 'cond[RCRIT_PBLANC_DE::GTE]':config.from, 'cond[RCRIT_PBLANC_DE::LTE]':config.to })) url.searchParams.set(k,v);
            const payload = await getJSON(url, fetchFn);
            if (!isRecord(payload) || !Array.isArray(payload.data)) throw new Error('공식 API 형식 오류');
            const prepared = preparePayload(format, payload, 'api');
            checkPage(payload.data, fingerprints);
            saveRaw(rawDir, source, run, `${operation}-${page}`, payload);
            stageNotices(staged, prepared.notices);
            const total = Number(payload.matchCount ?? payload.totalCount);
            if (Number.isFinite(total) && total < payload.data.length) throw new Error('공식 API의 전체 건수와 응답 건수가 일치하지 않습니다.');
            if (payload.data.length < 100 || (Number.isFinite(total) && page * 100 >= total)) { complete = true; break; }
          }
          if (!complete) throw new Error('공식 API 페이지 제한에 도달했습니다. 수집 기간을 나눠 다시 실행해 주세요.');
        }
      } else {
        for (const category of ['05','06','13','39']) {
          const fingerprints = new Set<string>();
          let complete = false;
          for (let page = 1; page <= 100; page++) {
            const url = new URL('https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1');
            for (const [k,v] of Object.entries({ ServiceKey:key, PG_SZ:'100', PAGE:String(page), UPP_AIS_TP_CD:category, PAN_NT_ST_DT:config.from.replaceAll('-','.'), CLSG_DT:config.to.replaceAll('-','.') })) url.searchParams.set(k,v);
            const payload = await getJSON(url, fetchFn);
            const rows = lhRows(payload);
            checkPage(rows, fingerprints);
            // 필터로 조회한 유형은 정규화에 전달하되, 원본 응답은 수정하지 않습니다.
            const prepared = preparePayload('lh-notices', [{ dsList:rows.map(row => ({ ...row, UPP_AIS_TP_CD:row.UPP_AIS_TP_CD ?? category })) }], 'api');
            saveRaw(rawDir, source, run, `${category}-${page}`, payload);
            stageNotices(staged, prepared.notices);
            if (rows.length < 100) { complete = true; break; }
          }
          if (!complete) throw new Error('공식 API 페이지 제한에 도달했습니다. 수집 기간을 나눠 다시 실행해 주세요.');
        }
      }
      const notices = [...staged.values()];
      const changes = store.upsertBatch(notices);
      const warnings = notices.reduce((sum,n) => sum + n.quality.length, 0);
      const message = `${config.from}~${config.to} 범위 ${notices.length}건 처리 · ${changes}건 신규·변경 · 원문 미검수`;
      store.finishRun(run, 'success', notices.length, message, warnings);
      results.push({ source, status:'success', count:notices.length, changes, warnings, message });
    } catch (error) {
      // 외부 예외의 URL·인증정보를 반환하지 않습니다. 이 출처의 데이터는 원자적으로 보존합니다.
      const publicCode = isRecord(error) && typeof error.publicCode === 'string' ? error.publicCode : '';
      const code = Object.hasOwn(failureMessages, publicCode) ? publicCode : 'invalid_response';
      const message = failureMessages[code]+' 기존 공고는 유지됩니다.';
      store.finishRun(run, 'failed', 0, message,0,code);
      results.push({ source, status:'failed', count:0, code, message });
    }
  }
  return results;
}
