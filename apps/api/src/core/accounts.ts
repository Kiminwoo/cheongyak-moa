import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isRecord } from '@cheongyak-moa/contracts';
import type { AccountRole } from '@cheongyak-moa/contracts';

export interface TemporaryAccount {
  username: string;
  role: AccountRole;
  publicKey: string;
  expiresAt: number;
}

export const roles = ['admin', 'client'] as const;
const sessionAge = 8 * 60 * 60 * 1000;
const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');

function privateKey(password: string) {
  const seed = Buffer.from(password, 'base64url');
  if (seed.length !== 32 || seed.toString('base64url') !== password) return null;
  return createPrivateKey({
    key: Buffer.concat([pkcs8Header, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

export function generateTemporaryAccount(username: string, role: AccountRole, expiresAt: number) {
  const password = randomBytes(32).toString('base64url');
  const key = privateKey(password);
  if (!key) throw new Error('임시 계정 키 생성 실패');
  const publicKey = createPublicKey(key)
    .export({ format: 'der', type: 'spki' })
    .toString('base64url');
  return { account: { username, role, publicKey, expiresAt }, password };
}

export function createAccountAuth(
  accounts: TemporaryAccount[],
  { secure, now = Date.now }: { secure: boolean; now?: () => number },
) {
  const cookie = secure ? '__Host-cheongyak-session' : 'cheongyak-local-session';
  const scope = secure ? 'production' : 'local';
  const keys = new Map(
    accounts.map((account) => [
      account.role,
      {
        ...account,
        key: createPublicKey({
          key: Buffer.from(account.publicKey, 'base64url'),
          format: 'der',
          type: 'spki',
        }),
      },
    ]),
  );
  function session(req: IncomingMessage): AccountRole | null {
    const token = req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookie + '='))
      ?.slice(cookie.length + 1);
    if (!token || token.length > 220) return null;
    const [role, until, signature, extra] = token.split('.');
    if (
      (role !== 'admin' && role !== 'client') ||
      !/^\d{13}$/.test(until ?? '') ||
      !/^[\w-]{86}$/.test(signature ?? '') ||
      extra !== undefined
    )
      return null;
    const account = keys.get(role);
    const expires = Number(until);
    const time = now();
    if (!account || expires <= time || expires > time + sessionAge || expires > account.expiresAt)
      return null;
    return verify(
      null,
      Buffer.from(`cheongyak-session-v1.${scope}.${role}.${until}`),
      account.key,
      Buffer.from(signature, 'base64url'),
    )
      ? role
      : null;
  }

  const setCookie = (value: string, age: number) =>
    `${cookie}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  let failures = 0;
  let resetAt = 0;
  async function handle(req: IncomingMessage, res: ServerResponse, path: string) {
    const send = (status: number, payload: unknown, cookieHeader?: string) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(cookieHeader ? { 'Set-Cookie': cookieHeader } : {}),
      });
      res.end(JSON.stringify(payload));
    };
    if (path === '/api/session' && req.method === 'GET') {
      send(200, { role: session(req) });
      return true;
    }
    if (path !== '/api/login' && path !== '/api/logout') return false;
    if (req.method !== 'POST') {
      send(405, { error: '지원하지 않는 요청입니다.' });
      return true;
    }
    if (
      req.headers['x-local-request'] !== '1' ||
      (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')
    ) {
      send(403, { error: '청약모아 화면에서 다시 시도해 주세요.' });
      return true;
    }
    if (path === '/api/logout') {
      send(200, { role: null }, setCookie('', 0));
      return true;
    }
    const time = now();
    if (time >= resetAt) {
      failures = 0;
      resetAt = time + 60000;
    }
    if (failures >= 30) {
      send(429, { error: '잠시 후 다시 시도해 주세요.' });
      return true;
    }
    let body: unknown;
    try {
      let text = '';
      for await (const chunk of req) {
        text += String(chunk);
        if (text.length > 1024) break;
      }
      if (text.length <= 1024) body = JSON.parse(text);
    } catch {
      // 잘못된 입력에는 같은 로그인 오류를 반환합니다.
    }
    if (isRecord(body) && typeof body.username === 'string' && typeof body.password === 'string') {
      const account = [...keys.values()].find((value) => value.username === body.username);
      const key = privateKey(body.password);
      if (account && account.expiresAt > time && key && createPublicKey(key).equals(account.key)) {
        const expiry = Math.min(time + sessionAge, account.expiresAt);
        const payload = `${account.role}.${expiry}`;
        const signature = sign(
          null,
          Buffer.from(`cheongyak-session-v1.${scope}.${payload}`),
          key,
        ).toString('base64url');
        send(
          200,
          { role: account.role },
          setCookie(`${payload}.${signature}`, Math.floor((expiry - time) / 1000)),
        );
        return true;
      }
    }
    failures++;
    send(401, { error: '계정이나 비밀번호를 확인해 주세요. 임시 계정이 만료됐을 수 있습니다.' });
    return true;
  }
  return { handle, session };
}
