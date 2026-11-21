import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BootstrapData } from '@cheongyak-moa/contracts';
import { matchNotice, koreaToday } from '@cheongyak-moa/domain';
import { createPreviewHandler, type PreviewAccess } from './preview-http.js';
import { createAccountAuth } from './core/accounts.js';
import type { TemporaryAccount } from './core/accounts.js';
import accounts from './core/temporary-accounts.json' with { type: 'json' };
import { cloudRefreshJobs } from './core/cloud-jobs.js';
import { summarizeQuality } from './core/data-quality.js';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'access.json'), 'utf8')) as PreviewAccess;
const snapshot = JSON.parse(readFileSync(join(root, 'notices.json'), 'utf8')) as BootstrapData;
const auth = createAccountAuth(accounts as TemporaryAccount[], { secure: true });
const refreshJobs = cloudRefreshJobs(process.env);
const handler = createPreviewHandler({
  ...config,
  accountLogin: config.publicReadOnly,
  webDirectory: join(root, 'web'),
  data: () => {
    const today = koreaToday();
    const notices = snapshot.notices
      .map((notice) => ({ ...notice, match: matchNotice(notice, {}, today) }))
      .filter((notice) => !['closed', 'cancelled'].includes(notice.match.stage));
    return {
      ...snapshot,
      today,
      notices,
      quality: summarizeQuality(notices),
      sources: snapshot.sources.map((source) => ({
        ...source,
        count: notices.filter((n) => n.sourceId === source.id).length,
      })),
    };
  },
});
export default async function vercelPreview(req: IncomingMessage, res: ServerResponse) {
  // Build Output API routes pass the original path to the single function.
  const url = new URL(req.url || '/', 'http://preview.local');
  const path = new URL('/' + (url.searchParams.get('__preview_path') || ''), url.origin).pathname;
  req.url = path;
  if (config.publicReadOnly) {
    if (await auth.handle(req, res, path)) return;
    if (path === '/api/bootstrap' || path.startsWith('/api/admin/')) {
      const role = auth.session(req);
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
      };
      if (!role) return json(401, { error: '로그인이 필요합니다.' });
      if (path.startsWith('/api/admin/')) {
        if (role !== 'admin') return json(403, { error: '관리자 권한이 필요합니다.' });
        if (path === '/api/admin/summary' && req.method === 'GET')
          return json(200, {
            snapshotAt: snapshot.snapshotAt,
            accountsExpireAt: accounts[0].expiresAt,
            cloudRefreshEnabled: refreshJobs !== null,
          });
        if (path !== '/api/admin/refresh')
          return json(404, { error: '페이지를 찾을 수 없습니다.' });
        if (req.method !== 'GET' && req.method !== 'POST')
          return json(405, { error: '지원하지 않는 요청입니다.' });
        if (
          req.method === 'POST' &&
          (req.headers['x-local-request'] !== '1' ||
            (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin'))
        )
          return json(403, { error: '청약모아 화면에서 다시 시도해 주세요.' });
        if (!refreshJobs)
          return json(503, { error: '클라우드 수집 서비스가 연결되지 않았습니다.' });
        try {
          if (req.method === 'GET') return json(200, { job: await refreshJobs.status() });
          return json(202, { job: await refreshJobs.start() });
        } catch {
          return json(502, { error: '클라우드 수집 서비스에 연결하지 못했습니다.' });
        }
      }
    }
  }
  return handler(req, res);
}
