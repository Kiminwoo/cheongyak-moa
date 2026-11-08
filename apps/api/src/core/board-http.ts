import { errorCode, isRecord } from '@cheongyak-moa/contracts';

export const BOARD_AGENT = 'CheongyakMoa';
export const BOARD_SITES = {
  sh: 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/list.do',
  gh: 'https://www.gh.or.kr/gh/announcement-of-salerental001.do?srCategoryId=12',
};
export type BoardSource = keyof typeof BOARD_SITES;
export type BoardFetch = (url: URL, options: RequestInit) => Promise<Response>;
export function boardError(code: string, message: string): Error & { publicCode: string } {
  return Object.assign(new Error(message), { publicCode: code });
}
export function boardURL(value: string, source: BoardSource, base = BOARD_SITES[source]): URL {
  const url = new URL(value, base);
  const domain = source === 'sh' ? 'i-sh.co.kr' : 'gh.or.kr';
  if (
    url.protocol !== 'https:' ||
    ![domain, 'www.' + domain].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    throw boardError('unsafe_url', '공식 게시판 외 주소로 이동할 수 없습니다.');
  url.hash = '';
  if (
    [...url.searchParams.keys()].some((name) =>
      /^(service_?key|api_?key|access_?token|password|authorization)$/i.test(name),
    )
  )
    throw boardError('unsafe_url', '인증정보가 포함된 게시판 주소는 수집하지 않습니다.');
  return url;
}
function normalizedPath(value: string): string {
  return value
    .replace(/[^\x00-\x7F]/gu, (letter) => encodeURIComponent(letter))
    .replace(/%[a-f\d]{2}/gi, (code) => {
      const decoded = String.fromCharCode(parseInt(code.slice(1), 16));
      return /[A-Za-z0-9._~-]/.test(decoded) ? decoded : code.toUpperCase();
    });
}
export function robotsAllows(body: string, target: string, agent = BOARD_AGENT): boolean {
  if (/<(?:html|!doctype)/i.test(body))
    throw boardError('robots_unknown', '접근 정책 응답이 robots.txt 형식이 아닙니다.');
  const groups: { agents: string[]; rules: { path: string; allow: boolean }[] }[] = [];
  let current = { agents: [] as string[], rules: [] as { path: string; allow: boolean }[] };
  let hasRules = false;
  for (const line of body.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(line.split('#')[0]);
    if (!match) continue;
    const name = match[1].toLowerCase(),
      value = match[2];
    if (name === 'user-agent') {
      if (hasRules) {
        groups.push(current);
        current = { agents: [], rules: [] };
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (['allow', 'disallow'].includes(name) && current.agents.length) {
      hasRules = true;
      if (!value) continue;
      if (!value.startsWith('/'))
        throw boardError('robots_unknown', '해석할 수 없는 접근 정책 경로입니다.');
      current.rules.push({ path: normalizedPath(value), allow: name === 'allow' });
    }
  }
  groups.push(current);
  const specific = groups.filter((group) => group.agents.includes(agent.toLowerCase()));
  const rules = (
    specific.length ? specific : groups.filter((group) => group.agents.includes('*'))
  ).flatMap((group) => group.rules);
  let selected: { length: number; allow: boolean } | undefined;
  const path = normalizedPath(target);
  for (const rule of rules) {
    const expression = rule.path
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
      .replace(/\\\$$/, '$');
    if (!new RegExp('^' + expression).test(path)) continue;
    const length = Buffer.byteLength(rule.path.replaceAll('*', '').replace(/\$$/, ''));
    if (!selected || length > selected.length || (length === selected.length && rule.allow))
      selected = { length, allow: rule.allow };
  }
  return selected?.allow ?? true;
}

export class BoardClient {
  private policies = new Map<string, string>();
  private lastRequest = 0;
  constructor(
    readonly source: BoardSource,
    private fetchFn: BoardFetch = fetch,
    private interval = 1000,
  ) {}
  policySnapshot(): [string, string][] {
    return [...this.policies.entries()];
  }
  private async request(
    url: URL,
    policyRequest = false,
  ): Promise<{ status: number; body: string; type: string }> {
    for (let redirect = 0; redirect < 5; redirect++) {
      boardURL(url.href, this.source);
      const delay = this.interval - (Date.now() - this.lastRequest);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      this.lastRequest = Date.now();
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
          headers: {
            accept: 'text/html,text/plain',
            'user-agent': `${BOARD_AGENT}/0.4 (+https://github.com/Kiminwoo/cheongyak-moa)`,
          },
        });
      } catch (error) {
        throw boardError(
          ['EACCES', 'EPERM'].includes(
            errorCode(isRecord(error) ? error.cause : undefined) || errorCode(error),
          )
            ? 'network_denied'
            : 'network_failed',
          '공식 게시판에 연결하지 못했습니다.',
        );
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw boardError('redirect_error', '게시판 이동 주소가 없습니다.');
        const next = boardURL(location, this.source, url.href);
        // 본문 이동도 이동 대상의 robots 정책을 확인합니다.
        if (!policyRequest) await this.check(next);
        url = next;
        continue;
      }
      const chunks: Uint8Array[] = [];
      const reader = response.body?.getReader();
      let bytes = 0;
      if (reader)
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2 * 1024 * 1024) {
            await reader.cancel();
            throw boardError('page_too_large', '게시판 응답 크기 제한을 초과했습니다.');
          }
          chunks.push(value);
        }
      const buffer = Buffer.concat(chunks);
      const type = response.headers.get('content-type') ?? '';
      const charset =
        /charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1] ??
        /charset\s*=\s*["']?([\w-]+)/i.exec(buffer.toString('ascii', 0, 2048))?.[1] ??
        'utf-8';
      let body: string;
      try {
        body = new TextDecoder(charset).decode(buffer);
      } catch {
        throw boardError('encoding_error', '게시판 문자 인코딩을 확인할 수 없습니다.');
      }
      return { status: response.status, body, type };
    }
    throw boardError('redirect_error', '게시판 이동 횟수를 초과했습니다.');
  }
  async check(url: URL): Promise<void> {
    let body = this.policies.get(url.origin);
    if (body == null) {
      const response = await this.request(new URL('/robots.txt', url.origin), true);
      if (response.status === 404 || response.status === 410) body = '';
      else if (response.status !== 200)
        throw boardError('robots_unknown', '공식 사이트의 자동 접근 정책을 확인할 수 없습니다.');
      else body = response.body;
      if (Buffer.byteLength(body) > 512000)
        throw boardError('robots_unknown', '접근 정책 문서가 너무 큽니다.');
      this.policies.set(url.origin, body);
      const delays = [...body.matchAll(/^\s*crawl-delay\s*:\s*(\d+(?:\.\d+)?)\s*$/gim)].map(
        (match) => Number(match[1]),
      );
      const delay = Math.max(0, ...delays);
      if (delay > 60)
        throw boardError('robots_unknown', '접근 정책의 요청 간격이 자동 수집 제한을 초과합니다.');
      this.interval = Math.max(this.interval, delay * 1000);
    }
    if (!robotsAllows(body, url.pathname + url.search))
      throw boardError('robots_denied', '공식 사이트가 이 게시판의 자동 수집을 제한하고 있습니다.');
  }
  async html(value: string): Promise<string> {
    const url = boardURL(value, this.source);
    await this.check(url);
    const response = await this.request(url);
    if (response.status !== 200)
      throw boardError(
        response.status === 403 || response.status === 401 ? 'access_denied' : 'http_error',
        '공식 게시판이 정상 페이지를 반환하지 않았습니다.',
      );
    if (!/text\/html|application\/xhtml\+xml/i.test(response.type))
      throw boardError('invalid_html', '공식 게시판이 HTML을 반환하지 않았습니다.');
    return response.body;
  }
}
