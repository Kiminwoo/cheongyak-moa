import { errorMessage } from '@cheongyak-moa/contracts';
import type {
  BootstrapData,
  View,
  FilterChange,
  RequestFn,
  ImportInput,
  ImportResult,
} from '@cheongyak-moa/contracts';
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { request, defaultFilters, selectNotices, viewCopy } from './lib.js';
import {
  Header,
  MobileNavigation,
  Hero,
  DataNotice,
  Sidebar,
  Stats,
  ListingTools,
  NoticeCard,
  EmptyState,
  Calendar,
  Modal,
  ProfileForm,
  NoticeDetail,
} from './components.js';
import DataConnections from './DataConnections.js';

function useInstallation() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null),
    [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(
      window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    const ready = (event: Event) => {
        const e = event as InstallPromptEvent;
        {
          e.preventDefault();
          setPrompt(e);
        }
      },
      done = () => {
        setInstalled(true);
        setPrompt(null);
      };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  const install = async () => {
    if (!prompt) return false;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
    return true;
  };
  return { installed, install };
}

export default function App({ requestFn = request }: { requestFn?: RequestFn }) {
  const [data, setData] = useState<BootstrapData | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('matching'),
    [filters, setFilters] = useState(defaultFilters),
    [month, setMonth] = useState<string | null>(null);
  const [modal, setModal] = useState<
      { type: 'profile' | 'install' } | { type: 'detail'; id: string } | null
    >(null),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(() => navigator.onLine === false),
    [updateAvailable, setUpdateAvailable] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null),
    dataModeInitialized = useRef(false),
    mounted = useRef(true),
    { installed, install } = useInstallation();
  const readOnly = data?.readOnly === true;
  const openProfile = () => {
    if (!data || readOnly) return;
    setModal({ type: 'profile' });
  };
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const payload = await requestFn<BootstrapData>('/api/bootstrap', { signal });
      if (mounted.current) {
        if (!dataModeInitialized.current) {
          setFilters((current) => ({
            ...current,
            dataMode: payload.notices.some((notice) => !notice.isDemo) ? 'live' : 'demo',
          }));
          dataModeInitialized.current = true;
          if (payload.readOnly) setView('all');
        }
        setData(payload);
        setMonth((m) => m || payload.today.slice(0, 7));
        setError('');
        setLoading(false);
      }
      return payload;
    },
    [requestFn],
  );
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    refresh(controller.signal).catch((e) => {
      if (!(e instanceof Error && e.name === 'AbortError')) {
        setError('로컬 서버에 연결하지 못했어요. 서버 실행 상태를 확인해 주세요.');
        setLoading(false);
      }
    });
    const online = () => {
      setOffline(false);
      refresh().catch(() =>
        setError('연결이 복구되지 않았습니다. 서버 실행 상태를 확인해 주세요.'),
      );
    };
    const offlineEvent = () => setOffline(true),
      update = () => setUpdateAvailable(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineEvent);
    window.addEventListener('app-update-ready', update);
    return () => {
      mounted.current = false;
      controller.abort();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offlineEvent);
      window.removeEventListener('app-update-ready', update);
    };
  }, [refresh]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!data?.collecting || offline) return;
    const timer = setInterval(
      () =>
        refresh()
          .then((next) => {
            if (!next.collecting) setMessage('수집이 종료되었습니다. 데이터 현황을 확인해 주세요.');
          })
          .catch(() => setError('수집 상태를 확인하지 못했습니다. 다시 연결해 주세요.')),
      2500,
    );
    return () => clearInterval(timer);
  }, [data?.collecting, offline, refresh]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !modal &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '') &&
        searchRef.current
      ) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [modal]);
  const navigate = (next: View) => {
    if (readOnly && ['matching', 'favorites'].includes(next)) next = 'all';
    setView(next);
    setFilters((f) => ({ ...f, status: '' }));
  };
  const filter: FilterChange = (name, value) => setFilters((f) => ({ ...f, [name]: value }));
  const reset = () => setFilters((f) => ({ ...defaultFilters, dataMode: f.dataMode }));
  const closeModal = () => setModal(null);
  async function saveFavorite(id: string) {
    if (offline || readOnly || pending.has(id)) return;
    const notice = data?.notices.find((n) => n.id === id);
    if (!notice) return;
    setPending((p) => new Set(p).add(id));
    try {
      await requestFn('/api/favorites', { method: 'POST', body: { id, saved: !notice.favorite } });
      await refresh();
      setMessage(notice.favorite ? '관심 공고에서 해제했어요.' : '관심 공고에 저장했어요.');
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  }
  async function saveProfile(profile: unknown) {
    if (readOnly) return;
    await requestFn('/api/profile', { method: 'POST', body: profile });
    await refresh();
    setMessage('나의 조건과 추천 이유가 업데이트되었어요.');
  }
  async function erase() {
    if (readOnly) return;
    await requestFn('/api/personal', { method: 'DELETE' });
    await refresh();
    setMessage('입력한 조건과 관심 공고를 삭제했습니다.');
  }
  async function collect() {
    if (readOnly) return;
    setBusy(true);
    try {
      await requestFn('/api/collect', { method: 'POST', body: {} });
      await refresh();
      setMessage('공식 공고 수집을 시작했어요.');
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function importData(payload: ImportInput) {
    if (readOnly) return;
    const result = await requestFn<ImportResult>('/api/import', { method: 'POST', body: payload });
    await refresh();
    filter('dataMode', 'live');
    setMessage(`${result.count}건을 가져왔어요. 파일 자료는 원문 미검수 상태입니다.`);
  }
  async function collectBoards() {
    if (readOnly) return;
    setBusy(true);
    try {
      await requestFn('/api/collect-boards', { method: 'POST', body: {} });
      await refresh();
      setMessage('공식 게시판 수집을 시작했어요. 기관의 접근 제한은 수집 이력에 표시합니다.');
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function setupEnv() {
    if (readOnly) return;
    setBusy(true);
    try {
      const result = await requestFn<{ message: string }>('/api/setup-env', {
        method: 'POST',
        body: {},
      });
      await refresh();
      setMessage(result.message);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function installApp() {
    try {
      if (!(await install())) setModal({ type: 'install' });
    } catch {
      setMessage('브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해 주세요.');
    }
  }
  const notices = useMemo(
    () => (data ? selectNotices(data.notices, filters, view) : []),
    [data, filters, view],
  );
  const statsNotices = useMemo(
    () => (data ? selectNotices(data.notices, filters, view, { status: false, stage: false }) : []),
    [data, filters, view],
  );
  const favoriteCount = data?.notices.filter((n) => n.favorite).length || 0;
  const detail = modal?.type === 'detail' ? data?.notices.find((n) => n.id === modal.id) : null;
  const [eyebrow, title, description] = viewCopy[view];
  return (
    <>
      <a className="skip" href="#content">
        본문 바로가기
      </a>
      <Header
        readOnly={readOnly}
        view={view}
        onNavigate={navigate}
        favoriteCount={favoriteCount}
        onInstall={installApp}
        installed={installed}
      />
      {readOnly && (
        <div className="connection-banner" role="status">
          공유 미리보기 · 조회 전용 · 개인 조건과 관심 목록은 제공하지 않습니다.
          {data?.snapshotAt && ` · 공고 사본: ${new Date(data.snapshotAt).toLocaleString('ko-KR')}`}
        </div>
      )}
      {(offline || error || updateAvailable) && (
        <div className="connection-banner" role="status">
          {offline
            ? '오프라인 상태예요. 이미 열린 화면만 볼 수 있으며 저장·수집은 연결 후 사용할 수 있어요.'
            : error || '새 버전이 준비됐어요. 새로고침하면 최신 화면을 불러옵니다.'}
          {!offline && (
            <button
              onClick={() => {
                if (updateAvailable) window.location.reload();
                else refresh().catch(() => setMessage('서버에 연결하지 못했습니다.'));
              }}
            >
              {updateAvailable ? '새로고침' : '다시 연결'}
            </button>
          )}
        </div>
      )}
      <main id="content" className="container">
        <Hero readOnly={readOnly} onProfile={openProfile} />
        {data ? (
          <>
            <DataNotice
              mode={filters.dataMode}
              liveCount={data.notices.filter((n) => !n.isDemo).length}
              onSources={() => navigate('sources')}
            />
            <div className="workspace">
              <Sidebar
                readOnly={readOnly}
                profile={data.profile}
                regions={data.regions}
                filters={filters}
                onFilter={filter}
                onReset={reset}
                onProfile={openProfile}
                onSources={() => navigate('sources')}
              />
              <section className="results" aria-labelledby="results-title">
                <div className="results-heading">
                  <div>
                    <p className="eyebrow">{eyebrow}</p>
                    <h2 id="results-title">{title}</h2>
                    <p>{description}</p>
                  </div>
                  <span className="today">{data.today.replaceAll('-', '.')} 기준</span>
                </div>
                <Stats
                  notices={statsNotices}
                  favoriteCount={favoriteCount}
                  openOnly={filters.openOnly}
                  onOpenToggle={() => {
                    if (view === 'sources' || view === 'calendar') setView('matching');
                    setFilters((current) => ({
                      ...current,
                      openOnly: !current.openOnly,
                      status: '',
                    }));
                  }}
                />
                {view === 'sources' ? (
                  readOnly ? (
                    <section id="sources-panel">
                      <h3>공고 출처</h3>
                      <p>
                        공개 모집공고를 조회하는 화면입니다. 수집·설정 기능과 개인 정보는 제공하지
                        않습니다. 전국 모든 기관의 공고가 연동된 상태는 아닙니다.
                      </p>
                      {data.sources.map((source) => (
                        <p key={source.id}>
                          {source.name} · {source.count}건 · {source.scope}
                        </p>
                      ))}
                    </section>
                  ) : (
                    <DataConnections
                      data={data}
                      onCollect={collect}
                      onBoards={collectBoards}
                      onRefresh={() => refresh().catch((e) => setMessage(errorMessage(e)))}
                      onImport={importData}
                      onSetup={setupEnv}
                      offline={offline}
                      busy={busy}
                    />
                  )
                ) : view === 'calendar' ? (
                  <Calendar
                    month={month || data.today.slice(0, 7)}
                    onMonth={setMonth}
                    today={data.today}
                    notices={selectNotices(data.notices, filters, view, { status: false })}
                    onDetail={(id) => setModal({ type: 'detail', id })}
                  />
                ) : (
                  <>
                    <ListingTools
                      filters={filters}
                      onFilter={filter}
                      count={notices.length}
                      searchRef={searchRef}
                    />
                    <div className="cards" aria-live="polite">
                      {notices.length ? (
                        notices.map((n) => (
                          <NoticeCard
                            key={n.id}
                            notice={n}
                            today={data.today}
                            onDetail={(id) => setModal({ type: 'detail', id })}
                            onFavorite={saveFavorite}
                            pending={pending.has(n.id)}
                            offline={offline || readOnly}
                          />
                        ))
                      ) : (
                        <EmptyState
                          openOnly={filters.openOnly}
                          live={filters.dataMode === 'live'}
                          view={view}
                          onSources={() => navigate('sources')}
                          onReset={filters.openOnly ? () => filter('openOnly', false) : reset}
                        />
                      )}
                    </div>
                  </>
                )}
                {view !== 'sources' && (
                  <div className="result-footer">
                    <span className="shield" aria-hidden="true">
                      ◇
                    </span>
                    <p>
                      추천은 입력 정보에 따른 사전 안내예요.
                      <br />
                      신청 전에는 공식 모집공고와 접수시간을 확인해 주세요.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="empty loading-panel" role="status">
            <span className="empty-icon" aria-hidden="true">
              ⌂
            </span>
            <h2>{loading ? '청약 정보를 불러오고 있어요' : '서비스에 연결하지 못했어요'}</h2>
            <p>
              {loading
                ? '나에게 맞는 기회를 준비하고 있어요.'
                : 'PC에서 서버를 실행하고 다시 연결해 주세요. 청약·사용자 정보는 오프라인 저장하지 않습니다.'}
            </p>
            {!loading && (
              <button
                className="primary"
                onClick={() => {
                  setLoading(true);
                  refresh().catch(() => {
                    setLoading(false);
                    setMessage('서버 실행 상태를 확인해 주세요.');
                  });
                }}
              >
                다시 연결
              </button>
            )}
          </div>
        )}
        <footer className="footer">
          <a className="footer-brand" href="/">
            청약모아.
          </a>
          <p>내 조건으로 찾는, 나의 다음 집.</p>
          <button onClick={() => navigate('sources')}>데이터 출처 및 개발 현황</button>
          <span>TYPESCRIPT MONOREPO · 0.4</span>
        </footer>
      </main>
      <MobileNavigation
        readOnly={readOnly}
        view={view}
        onNavigate={navigate}
        favoriteCount={favoriteCount}
      />
      {modal?.type === 'profile' && data && !readOnly && (
        <Modal onClose={closeModal} label="나의 청약 조건">
          <ProfileForm
            profile={data.profile}
            regions={data.regions}
            today={data.today}
            onSave={saveProfile}
            onErase={erase}
            onClose={closeModal}
            offline={offline}
          />
        </Modal>
      )}
      {detail && (
        <Modal onClose={closeModal} label="청약 공고 상세">
          <NoticeDetail
            readOnly={readOnly}
            notice={detail}
            onClose={closeModal}
            onFavorite={saveFavorite}
            pending={pending.has(detail.id)}
            offline={offline || readOnly}
            requestFn={requestFn}
          />
        </Modal>
      )}
      {modal?.type === 'install' && (
        <Modal onClose={closeModal} label="웹앱 설치 안내">
          <div className="dialog-top">
            <h2>앱처럼 편하게 열어보세요</h2>
            <button className="close-dialog" aria-label="닫기" onClick={closeModal}>
              ×
            </button>
          </div>
          <p className="dialog-description">
            지원하는 브라우저에서는 주소창의 설치 아이콘 또는 메뉴의 ‘앱 설치’를 선택하세요.
            iPhone·iPad는 Safari 공유 메뉴의 ‘홈 화면에 추가’를 이용할 수 있어요.
          </p>
          <div className="detail-alert">
            설치해도 현재 PC의 로컬 서버가 실행 중이어야 데이터를 사용할 수 있어요. 휴대폰 접속은
            별도 배포가 필요합니다.
          </div>
          <p className="helper">
            HTTPS 또는 localhost에서 지원합니다. 이 버전은 화면 파일만 오프라인 보관하며 공고·사용자
            정보는 캐시에 저장하지 않습니다.
          </p>
        </Modal>
      )}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </>
  );
}
