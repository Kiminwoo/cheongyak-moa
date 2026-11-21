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
import { summarizeQuality } from './core/data-quality.js';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'access.json'), 'utf8')) as PreviewAccess;
const snapshot = JSON.parse(readFileSync(join(root, 'notices.json'), 'utf8')) as BootstrapData;
const auth = createAccountAuth(accounts as TemporaryAccount[], { secure: true });
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
    if (path === '/api/bootstrap' || path === '/api/admin/summary') {
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
      if (path === '/api/admin/summary') {
        if (role !== 'admin') return json(403, { error: '관리자 권한이 필요합니다.' });
        if (req.method !== 'GET') return json(405, { error: '지원하지 않는 요청입니다.' });
        return json(200, {
          snapshotAt: snapshot.snapshotAt,
          accountsExpireAt: accounts[0].expiresAt,
        });
      }
    }
  }
  return handler(req, res);
}
