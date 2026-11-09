import { createPreviewHandler, previewHash } from './preview-http.js';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import type { BootstrapData, Notice, MatchedNotice } from '@cheongyak-moa/contracts';
import { matchNotice, koreaToday, REGIONS } from '@cheongyak-moa/domain';
import { summarizeQuality } from './core/data-quality.js';
import { sources } from './core/store.js';

// Deliberately never selects profile, favorites, run messages, or stored matching results.
function publicNotice(n: Notice): Notice {
  const {
    id,
    sourceId,
    externalId,
    title,
    source,
    region,
    city,
    address,
    type,
    subtype,
    isDemo,
    rulesComplete,
    rules,
    priceWon,
    depositWon,
    monthlyWon,
    area,
    areaBasis,
    priceBasis,
    description,
    starts,
    deadline,
    announced,
    winnerDate,
    units,
    cancelled,
    issuerName,
    provider,
    publicationDate,
    pricing,
    schedules,
    quality,
    provenance,
    operation,
    publicationEnd,
    sourceStatus,
    withdrawnFromProvider,
  } = n;
  let sourceUrl: string | null = null;
  try {
    const url = new URL(n.sourceUrl || '');
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ![...url.searchParams.keys()].some((key) => /key|token|password|secret|auth/i.test(key))
    )
      sourceUrl = url.href;
  } catch {
    /* Missing public source link. */
  }
  return {
    id,
    sourceId,
    externalId,
    title,
    source,
    region,
    city,
    address,
    type,
    subtype,
    isDemo,
    rulesComplete,
    rules,
    priceWon,
    depositWon,
    monthlyWon,
    area,
    areaBasis,
    priceBasis,
    description,
    starts,
    deadline,
    announced,
    winnerDate,
    units,
    cancelled,
    issuerName,
    provider,
    publicationDate,
    pricing,
    schedules,
    quality,
    provenance,
    operation,
    publicationEnd,
    sourceStatus,
    withdrawnFromProvider,
    sourceUrl,
  };
}

export function previewData(db: DatabaseSync, today = koreaToday()): BootstrapData {
  const notices: MatchedNotice[] = [];
  for (const row of db.prepare('SELECT body, updated_at, last_seen_at FROM notices').all()) {
    const n = publicNotice(JSON.parse(String(row.body)) as Notice);
    if (n.isDemo || n.withdrawnFromProvider) continue;
    const match = matchNotice(n, {}, today);
    if (['closed', 'cancelled'].includes(match.stage)) continue;
    notices.push({
      ...n,
      favorite: false,
      version: 1,
      updatedAt: String(row.updated_at),
      lastSeenAt: String(row.last_seen_at),
      match,
    });
  }
  return {
    readOnly: true,
    profile: {},
    notices,
    regions: REGIONS,
    today,
    collecting: false,
    runs: [],
    quality: summarizeQuality(notices),
    sources: sources.map((source) => ({
      ...source,
      configured: false,
      count: notices.filter((n) => n.sourceId === source.id).length,
    })),
    connection: {
      lookbackDays: 0,
      from: today,
      to: today,
      configured: { applyhome: false, lh: false, sh: false, gh: false, local: false },
      environment: { exists: false, restartRequired: false },
      importFormats: [],
      maxImportBytes: 0,
    },
  };
}

export function createPreview({
  database,
  webDirectory,
  password,
  expiresAt,
  now = Date.now,
}: {
  database: string;
  webDirectory: string;
  password: string;
  expiresAt: number;
  now?: () => number;
}) {
  if (password.length < 24 || expiresAt <= now())
    throw new Error('유효한 미리보기 인증 설정이 필요합니다.');
  const db = new DatabaseSync(database, { readOnly: true });
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000;');
  const handler = createPreviewHandler({
    data: () => previewData(db),
    webDirectory,
    expiresAt,
    now,
    authorizationHash: previewHash(
      'Basic ' + Buffer.from('preview:' + password).toString('base64'),
    ),
  });
  const server = createServer(handler);
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return { server, close: () => db.close() };
}
