import type { RequestListener } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BootstrapData } from '@cheongyak-moa/contracts';
export const previewHash = (value: string) => createHash('sha256').update(value).digest('hex');
const assets: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/responsive.css': ['responsive.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  '/icons/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png'],
};

export function createPreviewHandler({
  data,
  webDirectory,
  authorizationHash,
  expiresAt,
  now = Date.now,
}: {
  data: () => BootstrapData;
  webDirectory: string;
  authorizationHash: string;
  expiresAt: number;
  now?: () => number;
}): RequestListener {
  if (!/^[a-f0-9]{64}$/.test(authorizationHash) || !Number.isFinite(expiresAt))
    throw new Error('Invalid preview credentials');
  const expected = Buffer.from(authorizationHash, 'hex');
  const digest = (value: string) => Buffer.from(previewHash(value), 'hex');
  // Bounded per-process limiter; do not trust forwarded client addresses or allocate
  // per-client state. Serverless instances do not share this counter.
  let failures = 0,
    windowStart = now();
  const handler: RequestListener = (req, res) => {
    const send = (
      status: number,
      value: string | Buffer,
      type = 'application/json; charset=utf-8',
      extra: Record<string, string> = {},
    ) => {
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'none'; manifest-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        ...extra,
      });
      res.end(value);
    };
    if (now() >= expiresAt) return send(410, '{"error":"공유 시간이 종료되었습니다."}');
    if (now() - windowStart >= 60000) {
      failures = 0;
      windowStart = now();
    }
    if (failures >= 30)
      return send(429, '{"error":"잠시 후 다시 시도해 주세요."}', undefined, {
        'Retry-After': '60',
      });
    const auth = req.headers.authorization || '';
    if (auth.length > 256 || !timingSafeEqual(digest(auth), expected)) {
      // Initial browser challenges do not count as password guesses.
      if (auth) failures++;
      return send(401, '{"error":"미리보기 비밀번호가 필요합니다."}', undefined, {
        'WWW-Authenticate': 'Basic realm="CheongyakMoa Preview", charset="UTF-8"',
      });
    }
    if (!['GET', 'HEAD'].includes(req.method || ''))
      return send(405, '{"error":"조회 전용 화면입니다."}', undefined, { Allow: 'GET, HEAD' });
    let path: string;
    try {
      path = new URL(req.url || '/', 'http://preview.local').pathname;
    } catch {
      return send(400, '{"error":"잘못된 요청입니다."}');
    }
    try {
      if (path === '/api/bootstrap')
        return send(200, req.method === 'HEAD' ? '' : JSON.stringify(data()));
      if (assets[path]) {
        const [file, type] = assets[path];
        let bytes = readFileSync(join(webDirectory, file));
        if (path === '/')
          bytes = Buffer.from(
            bytes
              .toString('utf8')
              .replace('<head>', '<head><meta name="cheongyak-preview" content="true">')
              .replace(/<link rel="manifest"[^>]*>/g, ''),
          );
        return send(200, req.method === 'HEAD' ? '' : bytes, type);
      }
      return send(404, '{"error":"페이지를 찾을 수 없습니다."}');
    } catch {
      return send(503, '{"error":"미리보기를 준비하지 못했습니다. 운영자에게 문의해 주세요."}');
    }
  };

  return handler;
}
