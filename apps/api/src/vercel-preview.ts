import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BootstrapData } from '@cheongyak-moa/contracts';
import { matchNotice, koreaToday } from '@cheongyak-moa/domain';
import { createPreviewHandler, type PreviewAccess } from './preview-http.js';
import { summarizeQuality } from './core/data-quality.js';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'access.json'), 'utf8')) as PreviewAccess;
const snapshot = JSON.parse(readFileSync(join(root, 'notices.json'), 'utf8')) as BootstrapData;
const handler = createPreviewHandler({
  ...config,
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
export default function vercelPreview(req: IncomingMessage, res: ServerResponse) {
  // Build Output API routes pass the original path to the single protected function.
  const url = new URL(req.url || '/', 'http://preview.local');
  req.url = '/' + (url.searchParams.get('__preview_path') || '');
  return handler(req, res);
}
