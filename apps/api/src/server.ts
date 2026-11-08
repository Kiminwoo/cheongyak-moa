import { isRecord, errorMessage, errorCode } from '@cheongyak-moa/contracts';
import type { Environment, FetchJSON, ConnectionInfo } from '@cheongyak-moa/contracts';
import { projectRoot as findProjectRoot } from './paths.js';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Store, sources } from './core/store.js';
import { matchNotice, validateProfile, koreaToday, REGIONS } from '@cheongyak-moa/domain';
import { collect } from './core/collectors.js';
import { collectionConfig } from './core/config.js';
import { summarizeQuality } from './core/data-quality.js';
import { IMPORT_FORMATS } from './core/normalization.js';
import { importResponse, MAX_IMPORT_BYTES } from './core/ingestion.js';
import { envFileStatus, initializeEnv } from './core/setup.js';

const ROOT = findProjectRoot(import.meta.url);
const WEB_DIST = join(ROOT,'apps','web','dist');
const PUBLIC = existsSync(join(WEB_DIST,'index.html')) ? WEB_DIST : join(ROOT,'apps','web','public');
const allowedHosts = new Set(['127.0.0.1','localhost','[::1]']);
const assets: Record<string,[string,string]> = { '/': ['index.html','text/html; charset=utf-8'], '/app.js':['app.js','text/javascript; charset=utf-8'], '/style.css':['style.css','text/css; charset=utf-8'], '/favicon.svg':['favicon.svg','image/svg+xml'] };
Object.assign(assets, {
  '/responsive.css': ['responsive.css', 'text/css; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icons/icon-192.png': ['icons/icon-192.png', 'image/png'],
  '/icons/icon-512.png': ['icons/icon-512.png', 'image/png'],
  '/icons/maskable-512.png': ['icons/maskable-512.png', 'image/png'],
  '/icons/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png']
});
interface AppOptions { store?: Store; env?: Environment; fetchFn?: FetchJSON; projectRoot?: string; }
export function createApp({ store = new Store(join(ROOT,'data','cheongyak.sqlite')), env = process.env, fetchFn = fetch, projectRoot = ROOT }: AppOptions = {}) {
  let collecting = false;
  const startedAt = Date.now();
  const connection = (): ConnectionInfo => {
    let config;
    try { config = collectionConfig(env); }
    catch (error) { config = { ...collectionConfig({ ...env, COLLECT_LOOKBACK_DAYS:'180' }), error:errorMessage(error) }; }
    return { ...config, environment:envFileStatus(projectRoot,startedAt), importFormats:IMPORT_FORMATS, maxImportBytes:MAX_IMPORT_BYTES };
  };
  const server = createServer(async (req,res) => {
    const send = (status: number,value: unknown,type='application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      res.end(type.startsWith('application/json;') ? JSON.stringify(value) : value);
    };
    let url: URL;
    try { url = new URL(req.url || '/',`http://${req.headers.host}`); } catch { return send(400,{error:'잘못된 요청입니다.'}); }
    if (!allowedHosts.has(url.hostname)) return send(403,{error:'로컬 접속만 허용합니다.'});
    const origin = req.headers.origin;
    if (origin && origin !== url.origin) return send(403,{error:'다른 사이트에서의 요청은 허용하지 않습니다.'});
    if (!['GET','POST','DELETE'].includes(req.method)) return send(405,{error:'지원하지 않는 요청입니다.'});
    if (req.method !== 'GET' && req.headers['x-local-request'] !== '1') return send(403,{error:'로컬 앱에서 실행해 주세요.'});
    async function body(limit = 16384) {
      if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('JSON 입력이 필요합니다.'),{status:415});
      const chunks: Buffer[]=[]; let size=0;
      for await (const part of req) { size += part.length; if (size > limit) throw Object.assign(new Error('입력이 너무 큽니다.'),{status:413}); chunks.push(part); }
      try { return JSON.parse(Buffer.concat(chunks).toString()) as unknown; } catch { throw new Error('입력 형식을 확인해 주세요.'); }
    }
    try {
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file,type] = assets[url.pathname];
        try { return send(200,readFileSync(join(PUBLIC,file)),type); }
        catch (error) {
          if (errorCode(error) === 'ENOENT' && url.pathname === '/app.js') return send(503,'console.error("React 화면 빌드가 필요합니다. start.cmd를 실행해 주세요.");',type);
          throw error;
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
        const profile = store.profile(), notices = store.all().map(n => ({...n,match:matchNotice(n,profile)}));
        const info = connection();
        return send(200,{ profile,notices,regions:REGIONS,today:koreaToday(),connection:info,quality:summarizeQuality(notices),sources:sources.map(s => ({ ...s, configured:(s.id==='applyhome'||s.id==='lh')?info.configured[s.id]:false, count:notices.filter(n=>!n.isDemo&&n.sourceId===s.id).length })),runs:store.runs(),collecting });
      }
      if (req.method === 'GET' && url.pathname === '/api/connection') return send(200,connection());
      if (req.method === 'POST' && url.pathname === '/api/setup-env') return send(200,initializeEnv(projectRoot));
      if (req.method === 'POST' && url.pathname === '/api/import') {
        if (collecting) return send(409,{error:'수집 작업 종료 후 가져오기를 실행해 주세요.'});
        const input = await body(MAX_IMPORT_BYTES + 1024);
        if (!isRecord(input) || typeof input.format !== 'string') throw new Error('응답 형식을 선택해 주세요.');
        const result = importResponse(store,{format:input.format,payload:input.payload,rawDir:join(projectRoot,'data','raw')});
        return send(200,result);
      }
      if (req.method === 'POST' && url.pathname === '/api/profile') {
        const p=validateProfile(await body()); store.saveProfile(p); return send(200,{ok:true});
      }
      if (req.method === 'DELETE' && url.pathname === '/api/personal') { store.erasePersonal(); return send(200,{ok:true}); }
      if (req.method === 'POST' && url.pathname === '/api/favorites') {
        const p=await body(); if (!isRecord(p)||typeof p.id!=='string'||typeof p.saved!=='boolean') throw new Error('관심 공고 요청을 확인해 주세요.');
        store.favorite(p.id,p.saved); return send(200,{ok:true});
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/versions/')) return send(200,store.versions(decodeURIComponent(url.pathname.slice(14))));
      if (req.method === 'POST' && url.pathname === '/api/collect') {
        if (collecting) return send(409,{error:'수집이 이미 실행 중입니다.'});
        const config = collectionConfig(env);
        if (!config.configured.applyhome && !config.configured.lh) return send(400,{error:'.env에 공식 API 인증키를 설정하고 서버를 다시 시작해 주세요.'});
        collecting=true;
        // 응답 후 진행. 브라우저에서 상태를 새로 확인할 수 있도록 수집 이력을 기록합니다.
        send(202,{ok:true});
        collect(store,{env,fetchFn,rawDir:join(projectRoot,'data','raw')}).catch(()=>console.error('수집 작업 초기화에 실패했습니다. 저장소 접근 상태를 확인하세요.')).finally(()=>{collecting=false;}); return;
      }
      return send(404,{error:'페이지를 찾을 수 없습니다.'});
    } catch (error) { return send(isRecord(error)&&typeof error.status==='number'?error.status:400,{error:errorMessage(error).includes('SQLITE')?'저장 처리에 실패했습니다.':errorMessage(error)}); }
  });
  return {server,store};
}
