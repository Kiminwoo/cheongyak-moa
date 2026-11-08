import { errorMessage } from '@cheongyak-moa/contracts';
import { projectRoot as findProjectRoot } from '../paths.js';
import { collectionConfig } from '../core/config.js';
try {
  const config = collectionConfig();
  console.log(`수집 범위: ${config.from}~${config.to} (${config.lookbackDays}일)`);
  console.log(
    `청약홈 인증키: ${config.configured.applyhome ? '설정됨 · 승인 여부는 수집 시 확인' : '미설정'}`,
  );
  console.log(
    `LH 인증키: ${config.configured.lh ? '설정됨 · 승인 여부는 수집 시 확인' : '미설정'}`,
  );
  console.log('키 값은 출력하지 않습니다. 이 진단 명령은 외부 API를 호출하지 않습니다.');
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
