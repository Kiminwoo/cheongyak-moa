import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Store, sources } from './src/store.js';
import { matchNotice, validateProfile, koreaToday, REGIONS } from './src/matching.js';
import { collect } from './src/collectors.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const allowedHosts = new Set(['127.0.0.1','localhost','[::1]']);
const assets = { '/': ['index.html','text/html; charset=utf-8'], '/app.js':['app.js','text/javascript; charset=utf-8'], '/style.css':['style.css','text/css; charset=utf-8'], '/favicon.svg':['favicon.svg','image/svg+xml'] };
Object.assign(assets, {
  '/responsive.css': ['responsive.css', 'text/css; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icons/icon-192.png': ['icons/icon-192.png', 'image/png'],
  '/icons/icon-512.png': ['icons/icon-512.png', 'image/png'],
  '/icons/maskable-512.png': ['icons/maskable-512.png', 'image/png'],
  '/icons/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png']
});
export function createApp({ store = new Store(join(ROOT,'data','cheongyak.sqlite')), env = process.env, fetchFn = fetch } = {}) {
  let collecting = false;
  const server = createServer(async (req,res) => {
    const send = (status,value,type='application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      res.end(type.startsWith('application/json;') ? JSON.stringify(value) : value);
    };
    let url;
    try { url = new URL(req.url,`http://${req.headers.host}`); } catch { return send(400,{error:'잘못된 요청입니다.'}); }
    if (!allowedHosts.has(url.hostname)) return send(403,{error:'로컬 접속만 허용합니다.'});
    const origin = req.headers.origin;
    if (origin && origin !== url.origin) return send(403,{error:'다른 사이트에서의 요청은 허용하지 않습니다.'});
    if (!['GET','POST','DELETE'].includes(req.method)) return send(405,{error:'지원하지 않는 요청입니다.'});
    if (req.method !== 'GET' && req.headers['x-local-request'] !== '1') return send(403,{error:'로컬 앱에서 실행해 주세요.'});
    async function body() {
      if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('JSON 입력이 필요합니다.'),{status:415});
      const chunks=[]; let size=0;
      for await (const part of req) { size += part.length; if (size > 16384) throw Object.assign(new Error('입력이 너무 큽니다.'),{status:413}); chunks.push(part); }
      try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new Error('입력 형식을 확인해 주세요.'); }
    }
    try {
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file,type] = assets[url.pathname];
        try { return send(200,readFileSync(join(ROOT,'public',file)),type); }
        catch (error) {
          if (error.code === 'ENOENT' && url.pathname === '/app.js') return send(503,'console.error("React 화면 빌드가 필요합니다. start.cmd를 실행해 주세요.");',type);
          throw error;
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
        const profile = store.profile(), notices = store.all().map(n => ({...n,match:matchNotice(n,profile)}));
        return send(200,{ profile,notices,regions:REGIONS,today:koreaToday(),sources:sources.map(s => ({ ...s, configured:s.id==='applyhome'?!!env.APPLYHOME_SERVICE_KEY:s.id==='lh'?!!env.LH_SERVICE_KEY:false, count:notices.filter(n=>!n.isDemo&&n.sourceId===s.id).length })),runs:store.runs(),collecting });
      }
      if (req.method === 'POST' && url.pathname === '/api/profile') {
        const p=validateProfile(await body()); store.saveProfile(p); return send(200,{ok:true});
      }
      if (req.method === 'DELETE' && url.pathname === '/api/personal') { store.erasePersonal(); return send(200,{ok:true}); }
      if (req.method === 'POST' && url.pathname === '/api/favorites') {
        const p=await body(); if (typeof p.id!=='string'||typeof p.saved!=='boolean') throw new Error('관심 공고 요청을 확인해 주세요.');
        store.favorite(p.id,p.saved); return send(200,{ok:true});
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/versions/')) return send(200,store.versions(decodeURIComponent(url.pathname.slice(14))));
      if (req.method === 'POST' && url.pathname === '/api/collect') {
        if (collecting) return send(409,{error:'수집이 이미 실행 중입니다.'});
        if (!env.APPLYHOME_SERVICE_KEY && !env.LH_SERVICE_KEY) return send(400,{error:'.env에 공식 API 인증키를 설정하고 서버를 다시 시작해 주세요.'});
        collecting=true;
        // 응답 후 진행. 브라우저에서 상태를 새로 확인할 수 있도록 수집 이력을 기록합니다.
        send(202,{ok:true});
        collect(store,{env,fetchFn,rawDir:join(ROOT,'data','raw')}).catch(()=>console.error('수집 작업 초기화에 실패했습니다. 저장소 접근 상태를 확인하세요.')).finally(()=>{collecting=false;}); return;
      }
      return send(404,{error:'페이지를 찾을 수 없습니다.'});
    } catch (error) { return send(error.status||400,{error:error.message?.includes('SQLITE')?'저장 처리에 실패했습니다.':error.message||'요청을 처리하지 못했습니다.'}); }
  });
  return {server,store};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const {server,store}=createApp();
  const port=Number(process.env.PORT)||4310;
  server.listen(port,'127.0.0.1',()=>console.log(`청약모아 · 로컬 개발 버전 http://127.0.0.1:${port}`));
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'포트가 사용 중입니다. .env의 PORT를 변경해 주세요.':'서버 실행 실패');process.exitCode=1;store.close();});
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
}
