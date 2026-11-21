import React, { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage, isRecord } from '@cheongyak-moa/contracts';
import type { AccountRole, RequestFn } from '@cheongyak-moa/contracts';
import { request } from './lib.js';
import App from './App.js';

export default function AccountGate({ requestFn = request }: { requestFn?: RequestFn }) {
  const [role, setRole] = useState<AccountRole | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    requestFn<{ role: AccountRole | null }>('/api/session', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setRole(value.role);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('로그인 서버에 연결하지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => controller.abort();
  }, [requestFn]);

  const sessionRequest = useCallback<RequestFn>(
    async (path, options) => {
      try {
        return await requestFn(path, options);
      } catch (error) {
        if (isRecord(error) && error.status === 401) {
          setRole(null);
          setError('로그인 세션이 만료됐습니다. 다시 로그인해 주세요.');
        }
        throw error;
      }
    },
    [requestFn],
  );

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const { role } = await requestFn<{ role: AccountRole }>('/api/login', {
        method: 'POST',
        body: { username: fields.get('username'), password: fields.get('password') },
      });
      form.reset();
      setRole(role);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await requestFn('/api/logout', { method: 'POST', body: {} });
    setRole(null);
    setError('');
  }
  if (role) return <App requestFn={sessionRequest} account={{ role, logout }} />;
  return (
    <main aria-labelledby="login-title" className="account-screen">
      <section className="account-card">
        <img src="/favicon.svg" alt="" width="48" height="48" />
        <h1 id="login-title">청약모아 로그인</h1>
        <form onSubmit={login}>
          <label htmlFor="account-name">계정</label>
          <input
            id="account-name"
            name="username"
            autoComplete="username"
            required
            disabled={busy}
          />
          <label htmlFor="account-password">비밀번호</label>
          <input
            id="account-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
          <button type="submit" className="primary" disabled={!ready || busy}>
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
