import { isRecord } from '@cheongyak-moa/contracts';
import { decodeSnapshot } from './public-snapshot.js';

export const snapshotPath = 'apps/api/snapshots/public-notices.snapshot.json';
const endpoint = new URL(
  'https://api.github.com/repos/Kiminwoo/cheongyak-moa/contents/' + snapshotPath,
);

export function snapshotPublisher(token: string, fetchFn = fetch) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  return {
    async load() {
      const url = new URL(endpoint);
      url.searchParams.set('ref', 'main');
      const response = await fetchFn(url, {
        headers,
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`운영 사본 조회 실패 (HTTP ${response.status})`);
      const file: unknown = await response.json();
      if (
        !isRecord(file) ||
        typeof file.sha !== 'string' ||
        !/^[a-f0-9]{40}$/.test(file.sha) ||
        file.encoding !== 'base64' ||
        typeof file.content !== 'string'
      )
        throw new Error('운영 사본 응답 형식을 확인해 주세요.');
      return {
        sha: file.sha,
        snapshot: decodeSnapshot(Buffer.from(file.content, 'base64').toString('utf8')),
      };
    },
    async publish(encoded: string, sha: string) {
      decodeSnapshot(encoded);
      const response = await fetchFn(endpoint, {
        method: 'PUT',
        headers,
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
        body: JSON.stringify({
          message: 'chore(data): publish cloud housing refresh',
          branch: 'main',
          content: Buffer.from(encoded).toString('base64'),
          sha,
        }),
      });
      if (!response.ok) throw new Error(`운영 사본 발행 실패 (HTTP ${response.status})`);
    },
  };
}
