import { errorMessage } from '@cheongyak-moa/contracts';
import type {
  View,
  Filters,
  FilterChange,
  Profile,
  MatchedNotice,
  RequestFn,
} from '@cheongyak-moa/contracts';
import type { ReactNode, RefObject, FormEvent } from 'react';
import type { CalendarCell } from './lib.js';
interface NavigationProps {
  view: View;
  onNavigate: (view: View) => void;
  favoriteCount: number;
}
interface SidebarProps {
  profile: Profile;
  regions: string[];
  filters: Filters;
  onFilter: FilterChange;
  onReset: () => void;
  onProfile: () => void;
  onSources: () => void;
}
interface NoticeActions {
  notice: MatchedNotice;
  onFavorite: (id: string) => void;
  pending: boolean;
  offline: boolean;
}
import React, { useEffect, useRef, useState } from 'react';
import NoticeDataQuality from './NoticeDataQuality.js';
import PreferenceDetails, { preferenceLabels } from './PreferenceDetails.js';
import {
  matchLabels,
  typeLabels,
  stageLabels,
  money,
  shortDate,
  dateTime,
  daysTo,
  deadlineText,
  calendarCells,
  shiftMonth,
  downloadCalendar,
} from './lib.js';

export const navigation: [View, string, string][] = [
  ['matching', '맞춤 청약', '⌂'],
  ['all', '전체 청약', '▦'],
  ['calendar', '캘린더', '▤'],
  ['favorites', '관심 청약', '♡'],
];

export function Header({
  view,
  onNavigate,
  favoriteCount,
  onInstall,
  installed,
}: NavigationProps & { onInstall: () => void; installed: boolean }) {
  return (
    <header className="header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="청약모아 홈">
          <img src="/favicon.svg" alt="" width="36" height="36" />
          <span>
            청약모아<span className="brand-dot">.</span>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="주 메뉴">
          {navigation.map(([id, label]) => (
            <button
              key={id}
              className={`nav ${view === id ? 'active' : ''}`}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => onNavigate(id)}
            >
              {label}
              {id === 'favorites' && <span>{favoriteCount}</span>}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="install-button" onClick={onInstall}>
            {installed ? '앱 사용 안내' : '앱 설치 안내'} <span aria-hidden="true">↧</span>
          </button>
          <button
            className="local-chip"
            onClick={() => onNavigate('sources')}
            aria-label="데이터 연결 현황"
          >
            <span className="live-dot" />
            데이터 현황 <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function MobileNavigation({ view, onNavigate, favoriteCount }: NavigationProps) {
  return (
    <nav className="mobile-nav" aria-label="모바일 주 메뉴">
      {navigation.map(([id, label, icon]) => (
        <button
          key={id}
          className={view === id ? 'active' : ''}
          aria-current={view === id ? 'page' : undefined}
          onClick={() => onNavigate(id)}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            {icon}
            {id === 'favorites' && favoriteCount > 0 && <small>{favoriteCount}</small>}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

export function Hero({ onProfile }: { onProfile: () => void }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">
          <span /> 나의 다음 집을 만나는 곳
        </p>
        <h1 id="hero-title">
          흩어진 청약을 모아,
          <br />
          내게 맞는 기회로.
        </h1>
        <p className="hero-description">
          지역부터 예산, 나의 조건까지.
          <br />
          여러 기관의 청약을 한곳에서 차근차근 살펴보세요.
        </p>
        <button className="hero-link" onClick={onProfile}>
          내 조건 설정하기 <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className="hero-art" aria-hidden="true">
        <svg viewBox="0 0 600 300" fill="none">
          <circle cx="411" cy="79" r="47" fill="#d8e9ae" />
          <path
            d="M52 258C126 198 194 231 260 202c67-29 145 11 194-21 50-33 103-11 144 11v108H52Z"
            fill="#deeadb"
          />
          <path d="m95 120 62-33 64 33v146H95Z" fill="#a8c4b5" />
          <path d="m157 87 64 33v146h-64Z" fill="#8eaf9e" />
          <path
            d="m128 137 13-6v22l-13 6zm0 42 13-6v22l-13 6zm0 42 13-6v22l-13 6z"
            fill="#eef4d9"
          />
          <path d="m210 68 78-35 88 35v201H210Z" fill="#f1f2df" />
          <path d="m288 33 88 35v201h-88Z" fill="#c9d9c4" />
          <path
            d="M235 93h18v23h-18zm0 43h18v23h-18zm0 43h18v23h-18zm0 43h18v23h-18z"
            fill="#6c9a83"
          />
          <path
            d="M309 93h18v23h-18zm0 43h18v23h-18zm0 43h18v23h-18zm35-86h12v23h-12zm0 43h12v23h-12zm0 43h12v23h-12z"
            fill="#96b29b"
          />
          <path d="m360 151 65-39 67 39v117H360Z" fill="#608d76" />
          <path d="m425 112 67 39v117h-67Z" fill="#3d735b" />
          <path
            d="m382 166 17-8v22l-17 8zm0 39 17-8v22l-17 8zm57-39 14 7v21l-14-7zm0 39 14 7v21l-14-7z"
            fill="#e2e8be"
          />
          <path d="M73 269h462" stroke="#71937e" strokeWidth="2" strokeLinecap="round" />
          <path d="M87 261v-52m423 52v-72" stroke="#47725a" strokeWidth="4" />
          <ellipse cx="87" cy="201" rx="23" ry="35" fill="#789c76" />
          <ellipse cx="510" cy="190" rx="28" ry="39" fill="#9bb687" />
          <path d="M63 269c0-20 23-28 39-8m377 8c0-23 23-32 39-12" fill="#547c5c" />
          <path
            d="M392 38h14m-7-7v14M180 59h10m-5-5v10"
            stroke="#7a9a72"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div className="art-caption">
          <span>⌂</span> 새로운 시작은, 좋은 정보에서
        </div>
      </div>
    </section>
  );
}

export function DataNotice({
  mode,
  liveCount,
  onSources,
}: {
  mode: Filters['dataMode'];
  liveCount: number;
  onSources: () => void;
}) {
  return (
    <div className="data-notice">
      <span className="notice-mark" aria-hidden="true">
        i
      </span>
      <p>
        {mode === 'live' ? (
          <>
            <strong>수집·가져온 공고 {liveCount}건을 보고 있어요.</strong> API 수집과 파일 자료를
            구분해 데이터 현황에서 확인하세요.
          </>
        ) : mode === 'both' ? (
          <>
            <strong>공식 공고와 예시 공고를 함께 보고 있어요.</strong> 예시 표시는 실제 모집공고가
            아닙니다.
          </>
        ) : (
          <>
            <strong>현재 예시 데이터로 둘러보고 있어요.</strong> 실제 공고가 아닌 화면·매칭 검증용
            자료입니다.
          </>
        )}
      </p>
      <button onClick={onSources} aria-label="데이터 연결 현황">
        데이터 연결 현황 <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

export function Sidebar({
  profile,
  regions,
  filters,
  onFilter,
  onReset,
  onProfile,
  onSources,
}: SidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const entries = [
    ['관심 지역', profile.regions?.join(' · ') || '전국'],
    ['주거유형', profile.types?.map((t) => typeLabels[t]).join(' · ') || '모든 유형'],
    ['분양 예산', profile.saleBudget == null ? '아직 입력 전' : money(profile.saleBudget * 10000)],
    [
      '임대 보증금',
      profile.depositBudget == null ? '아직 입력 전' : money(profile.depositBudget * 10000),
    ],
  ];
  return (
    <aside className="sidebar" aria-label="나의 조건과 검색 필터">
      <div className="side-heading">
        <div>
          <p className="eyebrow">MY CONDITIONS</p>
          <h2>나의 청약 조건</h2>
        </div>
        <span className="round-icon" aria-hidden="true">
          ⌁
        </span>
      </div>
      <div id="profile-summary">
        <div className="summary-items">
          {entries.map(([label, value]) => (
            <div className="summary-item" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
      <button className="primary full" onClick={onProfile}>
        {Object.keys(profile).length ? '내 조건 수정하기' : '내 조건 설정하기'}{' '}
        <span aria-hidden="true">＋</span>
      </button>
      <p className="side-footnote">
        조건을 입력할수록
        <br />
        추천 이유를 자세히 알려드려요.
      </p>
      <button
        className="mobile-filter-toggle secondary"
        aria-expanded={expanded}
        aria-controls="search-filters"
        onClick={() => setExpanded(!expanded)}
      >
        검색 필터 {filters.region || filters.type ? '· 적용 중' : ''}
        <span aria-hidden="true">{expanded ? '−' : '＋'}</span>
      </button>
      <div id="search-filters" className={`filter-section ${expanded ? 'expanded' : ''}`}>
        <div className="side-divider" />
        <label className="field-label" htmlFor="filter-region">
          공급 지역
        </label>
        <select
          id="filter-region"
          value={filters.region}
          onChange={(e) => onFilter('region', e.target.value)}
        >
          <option value="">전국 모든 지역</option>
          {regions.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <label className="field-label" htmlFor="filter-type">
          주거유형
        </label>
        <select
          id="filter-type"
          value={filters.type}
          onChange={(e) => onFilter('type', e.target.value as Filters['type'])}
        >
          <option value="">모든 주거유형</option>
          {Object.entries(typeLabels).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <label className="field-label" htmlFor="filter-data">
          데이터 구분
        </label>
        <select
          id="filter-data"
          value={filters.dataMode}
          onChange={(e) => onFilter('dataMode', e.target.value as Filters['dataMode'])}
        >
          <option value="demo">예시 공고</option>
          <option value="live">수집·가져온 공고</option>
          <option value="both">전체 · 예시 포함</option>
        </select>
        <label className="check-label">
          <input
            type="checkbox"
            checked={filters.includeClosed}
            onChange={(e) => onFilter('includeClosed', e.target.checked)}
          />{' '}
          마감·취소 공고도 보기
        </label>
        <button className="reset-button" onClick={onReset}>
          ↻ 검색 필터 초기화
        </button>
        <label className="check-label">
          <input
            type="checkbox"
            checked={filters.excludeMismatch}
            onChange={(e) => onFilter('excludeMismatch', e.target.checked)}
          />{' '}
          선호 조건 불일치 제외
        </label>
        <p className="helper">금액·지역 미확인 공고는 확인 대상으로 남깁니다.</p>
      </div>
      <div className="coverage-card">
        <span className="mini-label">조금씩, 더 넓게</span>
        <strong>청약 정보의 빈틈을 줄여요.</strong>
        <p>
          연동 기관과 확인 범위를
          <br />
          투명하게 안내합니다.
        </p>
        <button onClick={onSources}>
          수집 범위 확인 <span aria-hidden="true">↗</span>
        </button>
      </div>
    </aside>
  );
}

export function Stats({
  notices,
  favoriteCount,
}: {
  notices: MatchedNotice[];
  favoriteCount: number;
}) {
  const entries = [
    ['살펴볼 청약', notices.length, '⌂'],
    ['지금 접수 중', notices.filter((n) => n.match.stage === 'open').length, '◷'],
    ['내가 저장한 청약', favoriteCount, '♡'],
  ];
  return (
    <div className="stats">
      {entries.map(([label, count, icon], i) => (
        <div className={`stat ${i === 1 ? 'highlight' : ''}`} key={label}>
          <div>
            <span className="stat-label">{label}</span>
            <strong>
              {count}
              <small>건</small>
            </strong>
          </div>
          <span className="stat-icon" aria-hidden="true">
            {icon}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ListingTools({
  filters,
  onFilter,
  count,
  searchRef,
}: {
  filters: Filters;
  onFilter: FilterChange;
  count: number;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div>
      <div className="search-row">
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            type="search"
            value={filters.search}
            onChange={(e) => onFilter('search', e.target.value)}
            placeholder="지역, 단지명, 공급유형으로 검색"
            aria-label="공고 검색"
          />
          <kbd>/</kbd>
        </label>
        <select
          value={filters.sort}
          onChange={(e) => onFilter('sort', e.target.value as Filters['sort'])}
          aria-label="정렬 방식"
        >
          <option value="recommended">추천순</option>
          <option value="deadline">마감 임박순</option>
          <option value="recent">최신 공고순</option>
        </select>
      </div>
      <div className="list-toolbar">
        <div className="filter-pills" aria-label="자격 점검 상태">
          {(
            [
              ['', '전체'],
              ['demo-match', '예시 조건 일치'],
              ['missing', '추가 입력 필요'],
              ['review', '공고 확인 필요'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={`pill ${filters.status === value ? 'active' : ''}`}
              aria-pressed={filters.status === value}
              onClick={() => onFilter('status', value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span id="result-count">총 {count}건</span>
      </div>
    </div>
  );
}

export function NoticeCard({
  notice: n,
  today,
  onDetail,
  onFavorite,
  pending,
  offline,
}: NoticeActions & { today: string; onDetail: (id: string) => void }) {
  const m = n.match,
    reason =
      m.failed[0] || (m.missing.length ? `${m.missing.join(' · ')}를 입력해 주세요` : m.reasons[0]);
  const cls =
    m.status === 'review' || m.status === 'missing'
      ? 'review'
      : m.status === 'ineligible'
        ? 'ineligible'
        : '';
  const remaining = daysTo(n.deadline, today);
  return (
    <article className="card">
      <div className="card-top">
        <span
          className={`badge ${n.type === 'rental' ? 'green' : n.type === 'officetel' ? 'blue' : 'amber'}`}
        >
          {n.subtype}
        </span>
        <span className="badge gray">
          {n.isDemo ? '예시' : n.provenance?.method === 'file-import' ? '파일·미검수' : n.source}
        </span>
      </div>
      <button
        className={`bookmark ${n.favorite ? 'saved' : ''}`}
        disabled={pending || offline}
        onClick={() => onFavorite(n.id)}
        aria-label={`${n.title} ${n.favorite ? '관심 해제' : '관심 저장'}`}
        aria-pressed={n.favorite}
      >
        <svg viewBox="0 0 20 24" fill="none" aria-hidden="true">
          <path
            d="M4 3h12v18l-6-4-6 4V3Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <p className="card-location">
        {n.region}
        {n.city && ` · ${n.city}`}
      </p>
      <h3>
        <button className="card-title" onClick={() => onDetail(n.id)}>
          {n.title}
        </button>
      </h3>
      <div className="card-meta">
        <span>{n.area == null ? '면적 원문 확인' : `${n.area}㎡ ${n.areaBasis || ''}`}</span>
        <span className="meta-dot" />
        <span>{n.units == null ? '물량 원문 확인' : `${n.units.toLocaleString()}세대`}</span>
        <span className="meta-dot" />
        <span>{n.source}</span>
      </div>
      <div className="price-row">
        {n.type === 'rental' ? (
          <>
            <span className="price-label">보증금</span>
            <strong className="price-main">{money(n.depositWon)}</strong>
            <span className="price-extra">/ 월 {money(n.monthlyWon)}</span>
          </>
        ) : (
          <>
            <span className="price-label">{n.isDemo ? '예시 가격' : '공급 가격'}</span>
            <strong className="price-main">{money(n.priceWon)}</strong>
          </>
        )}
      </div>
      <p className={`preference-summary ${m.preference.state}`}>
        {preferenceLabels[m.preference.state]}
      </p>
      <div className={`match-box ${cls}`}>
        <div className="match-title">
          <span aria-hidden="true">
            {m.status === 'demo-match' ? '✓' : m.status === 'ineligible' ? '!' : '◇'}
          </span>
          {matchLabels[m.status]}
        </div>
        <p>{reason}</p>
      </div>
      <div className="card-bottom">
        <span>
          {shortDate(n.starts)} — {shortDate(n.deadline)}{' '}
          <strong
            className={remaining !== null && remaining >= 0 && remaining <= 3 ? 'urgent' : ''}
          >
            {deadlineText(n, today)}
          </strong>
        </span>
        <button onClick={() => onDetail(n.id)}>
          자세히 <span aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
  );
}

export function EmptyState({
  live,
  view,
  onSources,
  onReset,
}: {
  live: boolean;
  view: View;
  onSources: () => void;
  onReset: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        ⌂
      </span>
      <h3>
        {live
          ? '공식 공고를 확인할 준비가 되었어요'
          : view === 'favorites'
            ? '저장한 공고가 없거나 필터 밖에 있어요'
            : '선택한 조건의 공고가 없어요'}
      </h3>
      <p>
        {live
          ? 'API 연결 상태와 수집 범위를 확인하거나 검색 필터를 넓혀보세요.'
          : view === 'favorites'
            ? '공고의 북마크를 눌러 저장하거나 필터를 초기화해 보세요.'
            : '검색어와 필터를 넓혀보세요. 수집 범위 밖의 공고는 결과에 포함되지 않아요.'}
      </p>
      <button className="secondary" onClick={live ? onSources : onReset}>
        {live ? '데이터 현황 보기' : '필터 초기화'}
      </button>
    </div>
  );
}

export function Calendar({
  month,
  onMonth,
  today,
  notices,
  onDetail,
}: {
  month: string;
  onMonth: (month: string) => void;
  today: string;
  notices: MatchedNotice[];
  onDetail: (id: string) => void;
}) {
  const cells = calendarCells(month, notices),
    [y, m] = month.split('-');
  const events = cells.filter((c): c is CalendarCell => !!c?.events.length);
  return (
    <section aria-label="청약 일정">
      <div className="calendar-tools">
        <button onClick={() => onMonth(shiftMonth(month, -1))} aria-label="이전 달">
          ←
        </button>
        <h3>
          {y}년 {Number(m)}월
        </h3>
        <button onClick={() => onMonth(shiftMonth(month, 1))} aria-label="다음 달">
          →
        </button>
        <button onClick={() => onMonth(today.slice(0, 7))}>이번 달</button>
      </div>
      <div className="calendar-grid desktop-calendar">
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
          <div className="calendar-head" key={day}>
            {day}
          </div>
        ))}
        {cells.map((c, i) =>
          c ? (
            <div key={c.date} className={`calendar-day ${c.date === today ? 'today-cell' : ''}`}>
              <span>{c.day}</span>
              {c.events.map(({ n, label, end }) => (
                <button
                  key={n.id + label}
                  className={`calendar-event ${end ? 'end' : ''}`}
                  onClick={() => onDetail(n.id)}
                  title={`${label} · ${n.title}`}
                >
                  {label} · {n.title}
                </button>
              ))}
            </div>
          ) : (
            <div key={`empty-${i}`} className="calendar-day calendar-empty" />
          ),
        )}
      </div>
      <div className="mobile-agenda">
        {events.length ? (
          events.map((c) => (
            <section className="agenda-date" key={c.date}>
              <h4>
                {shortDate(c.date)}{' '}
                <span>
                  {
                    ['일', '월', '화', '수', '목', '금', '토'][
                      new Date(`${c.date}T00:00:00Z`).getUTCDay()
                    ]
                  }
                  요일
                </span>
                {c.date === today && <span className="badge green">오늘</span>}
              </h4>
              {c.events.map(({ n, label, end }) => (
                <button className="agenda-event" key={n.id + label} onClick={() => onDetail(n.id)}>
                  <span className={`badge ${end ? 'amber' : 'green'}`}>{label}</span>
                  <strong>{n.title}</strong>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </section>
          ))
        ) : (
          <div className="empty">
            <p>이 달에는 확인된 접수 일정이 없어요.</p>
          </div>
        )}
      </div>
      <p className="helper">
        시작일과 마감일만 표시해요. 접수시간과 공급유형별 상세 일정은 공식 원문을 확인해 주세요.
        미확인 일정은 표시하지 않습니다.
      </p>
    </section>
  );
}

export function Modal({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current,
      previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="app-dialog"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">{children}</div>
    </dialog>
  );
}

export function ProfileForm({
  profile: p,
  regions,
  today,
  onSave,
  onErase,
  onClose,
  offline,
}: {
  profile: Profile;
  regions: string[];
  today: string;
  onSave: (profile: unknown) => Promise<void>;
  onErase: () => Promise<void>;
  onClose: () => void;
  offline: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const profile = {
      ...Object.fromEntries(fd.entries()),
      regions: fd.getAll('regions'),
      types: fd.getAll('types'),
    };
    setBusy(true);
    setError('');
    try {
      await onSave(profile);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function erase() {
    if (!window.confirm('입력한 조건과 관심 공고를 삭제할까요? 공고 데이터는 유지됩니다.')) return;
    setBusy(true);
    try {
      await onErase();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="dialog-top">
        <div>
          <p className="eyebrow">A LITTLE ABOUT YOU</p>
          <h2>어떤 집을 찾고 있나요?</h2>
        </div>
        <button className="close-dialog" aria-label="닫기" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="dialog-description">
        희망 조건부터 가볍게 입력하세요.
        <br />
        자격 점검 정보는 필요한 경우에 추가해도 괜찮아요.
      </p>
      <form onSubmit={submit} aria-label="내 조건 입력">
        <fieldset disabled={busy || offline} className="form-fieldset">
          <section className="form-section">
            <h3>
              관심 지역 <span className="helper">· 복수 선택, 미선택 시 전국</span>
            </h3>
            <div className="region-picker">
              {regions.map((r) => (
                <label className="choice" key={r}>
                  <input
                    type="checkbox"
                    name="regions"
                    value={r}
                    defaultChecked={p.regions?.includes(r)}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </section>
          <section className="form-section">
            <h3>주거유형</h3>
            <div className="type-picker">
              {Object.entries(typeLabels).map(([v, label]) => (
                <label className="choice" key={v}>
                  <input
                    type="checkbox"
                    name="types"
                    value={v}
                    defaultChecked={p.types?.some((type) => type === v)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>
          <section className="form-section">
            <h3>
              희망 예산 <span className="helper">· 만원 단위, 선택 입력</span>
            </h3>
            <div className="form-grid">
              {(
                [
                  ['saleBudget', '분양·매입 예산', '예: 60000 (6억원)'],
                  ['depositBudget', '임대 보증금', '예: 5000 (5천만원)'],
                  ['monthlyBudget', '월 임대료', '예: 50 (50만원)'],
                ] as const
              ).map(([name, label, placeholder]) => (
                <label key={name}>
                  {label}
                  <input
                    type="number"
                    inputMode="numeric"
                    name={name}
                    min="0"
                    max="10000000000"
                    step="1"
                    defaultValue={p[name] ?? ''}
                    placeholder={placeholder}
                  />
                </label>
              ))}
            </div>
            <p className="helper">
              가격 미확인 공고는 확인 대상으로 남겨요. 대출 가능액은 계산하지 않습니다.
            </p>
          </section>
          <section className="form-section">
            <h3>
              자격 사전점검 정보 <span className="helper">· 선택 입력</span>
            </h3>
            <div className="form-grid">
              <label>
                생년월일
                <input
                  type="date"
                  name="birthDate"
                  min="1900-01-01"
                  max={today}
                  defaultValue={p.birthDate || ''}
                />
              </label>
              <label>
                본인 주택 보유 여부
                <select name="housingOwned" defaultValue={p.housingOwned || 'unknown'}>
                  <option value="unknown">아직 입력하지 않을게요</option>
                  <option value="no">보유하고 있지 않아요</option>
                  <option value="yes">보유하고 있어요</option>
                </select>
              </label>
            </div>
            <p className="helper">
              현재는 가상 공고의 테스트 규칙에만 사용해요. 본인 보유 여부만으로 세대 무주택 자격을
              판정하지 않습니다.
            </p>
          </section>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>
              취소
            </button>
            <button className="primary" type="submit">
              {busy ? '저장 중…' : '조건 저장하고 찾아보기 →'}
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="privacy-row">
        <p>
          입력 정보는 이 PC의 로컬 DB에 저장돼요.
          <br />
          공용 PC에서는 사용 후 삭제해 주세요.
        </p>
        <button className="danger" disabled={busy || offline} onClick={erase}>
          내 정보·관심 공고 삭제
        </button>
      </div>
    </>
  );
}

export function NoticeDetail({
  notice: n,
  onClose,
  onFavorite,
  pending,
  offline,
  requestFn,
}: NoticeActions & { onClose: () => void; requestFn: RequestFn }) {
  const [versions, setVersions] = useState<{ version: number; createdAt: string }[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    requestFn<{ version: number; createdAt: string }[]>(
      `/api/versions/${encodeURIComponent(n.id)}`,
      { signal: controller.signal },
    )
      .then(setVersions)
      .catch((e) => {
        if (!(e instanceof Error && e.name === 'AbortError'))
          setError('이력을 불러오지 못했습니다.');
      });
    return () => controller.abort();
  }, [n.id, requestFn]);
  const m = n.match,
    items = [
      ['공급 지역', `${n.region} ${n.city}`],
      ['공급유형', n.subtype],
      ['접수 시작', n.starts || '원문 확인'],
      ['접수 마감', n.deadline || '원문 확인'],
      ['공급물량', n.units == null ? '원문 확인' : `${n.units}세대`],
      ['당첨 발표', n.winnerDate || '원문 확인'],
      ['가격 기준', n.priceBasis],
      ['최근 확인', dateTime(n.lastSeenAt)],
    ];
  return (
    <>
      <div className="dialog-top">
        <div>
          <p className="eyebrow">
            {n.isDemo
              ? 'DEMO NOTICE'
              : n.provenance?.method === 'file-import'
                ? 'FILE IMPORT · UNVERIFIED'
                : 'OFFICIAL API · UNREVIEWED'}
          </p>
          <h2>{n.title}</h2>
        </div>
        <button className="close-dialog" aria-label="닫기" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="dialog-description">
        {n.address} · {n.source} · 버전 {n.version}
      </p>
      <div className="detail-alert">{n.description}</div>
      <div className="detail-grid">
        {items.map(([k, v]) => (
          <div className="detail-item" key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <NoticeDataQuality notice={n} />
      <PreferenceDetails assessment={m.preference} />
      <section className="detail-section">
        <h3>{matchLabels[m.status]}</h3>
        <ul>
          {[...m.failed, ...m.missing.map((x) => `${x} 입력이 필요합니다.`), ...m.reasons].map(
            (r, i) => (
              <li key={i}>{r}</li>
            ),
          )}
        </ul>
        <p>
          {m.basisDate && `비교 기준일: ${m.basisDate}. `}실제 자격은 세대·거주·통장·소득·자산·당첨
          이력 등 해당 공고의 모든 조건을 확인해야 합니다.
        </p>
      </section>
      {n.rules.length > 0 && (
        <section className="detail-section">
          <h3>가상 규칙과 근거</h3>
          {n.rules.map((r, i) => (
            <p key={i}>{r.evidence}</p>
          ))}
        </section>
      )}
      <section className="detail-section">
        <h3>원본과 변경 이력</h3>
        <p>
          {error ||
            (versions
              ? versions.map((v) => `v${v.version} · ${dateTime(v.createdAt)}`).join(' / ')
              : '변경 이력을 확인하고 있어요…')}
        </p>
      </section>
      <div className="detail-actions">
        {n.sourceUrl ? (
          <a className="primary" href={n.sourceUrl} target="_blank" rel="noopener noreferrer">
            공식 공고 확인 ↗
          </a>
        ) : (
          <span className="helper">가상 공고에는 실제 신청 링크가 없습니다.</span>
        )}
        <button
          className="secondary"
          disabled={pending || offline}
          onClick={() => onFavorite(n.id)}
        >
          {n.favorite ? '관심 해제' : '관심 공고 저장'}
        </button>
        {n.starts && n.deadline && (
          <button className="secondary" onClick={() => downloadCalendar(n)}>
            일정 파일 받기
          </button>
        )}
      </div>
    </>
  );
}
