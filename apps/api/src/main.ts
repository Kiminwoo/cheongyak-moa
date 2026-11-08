import { createApp } from './server.js';
import { errorCode } from '@cheongyak-moa/contracts';
const {server,store}=createApp();
  const port=Number(process.env.PORT)||4310;
  server.listen(port,'127.0.0.1',()=>console.log(`청약모아 · 로컬 개발 버전 http://127.0.0.1:${port}`));
  server.on('error',e=>{console.error(errorCode(e)==='EADDRINUSE'?'포트가 사용 중입니다. .env의 PORT를 변경해 주세요.':'서버 실행 실패');process.exitCode=1;store.close();});
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
