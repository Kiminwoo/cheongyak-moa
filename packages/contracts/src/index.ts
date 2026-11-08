export type HousingType = 'sale' | 'rental' | 'officetel';
export type HousingOwned = 'yes' | 'no' | 'unknown';
export type View = 'matching' | 'all' | 'calendar' | 'favorites' | 'sources';
export type MatchStatus = 'review' | 'missing' | 'ineligible' | 'demo-match';
export type NoticeStage = 'open' | 'upcoming' | 'closed' | 'unknown' | 'cancelled';
export type CollectionMethod = 'api' | 'web' | 'file-import';
export type ApiSource = 'applyhome' | 'lh' | 'sh' | 'gh' | 'local';
export type Environment = Record<string, string | undefined>;

export interface Profile {
  regions?: string[];
  types?: HousingType[];
  birthDate?: string;
  housingOwned?: HousingOwned;
  saleBudget?: number | null;
  depositBudget?: number | null;
  monthlyBudget?: number | null;
}
interface RuleBase {
  basisDate: string;
  approved: boolean;
  evidence: string;
}
export type EligibilityRule = RuleBase &
  ({ field: 'age'; min: number; max: number } | { field: 'housingOwned'; equals: HousingOwned });
export interface Schedule {
  label: string;
  start: string | null;
  end: string | null;
}
export interface QualityIssue {
  code: string;
  message: string;
  severity: 'warning' | 'error';
}
export interface Notice {
  issuerName?: string;
  provider?: 'myhome' | 'sh-board' | 'gh-board';
  publicationDate?: string;
  withdrawnFromProvider?: boolean;
  pricing?: {
    operation: string;
    basis: 'model-maximum';
    models: SupplyPrice[];
  };
  id: string;
  sourceId: string;
  externalId: string;
  title: string;
  source: string;
  region: string;
  city: string;
  address: string;
  type: HousingType;
  subtype: string;
  isDemo: boolean;
  rulesComplete: boolean;
  rules: EligibilityRule[];
  priceWon: number | null;
  depositWon: number | null;
  monthlyWon: number | null;
  area: number | null;
  areaBasis: string | null;
  priceBasis: string;
  description: string;
  starts: string | null;
  deadline: string | null;
  announced: string | null;
  winnerDate: string | null;
  units: number | null;
  sourceUrl: string | null;
  cancelled: boolean;
  operation?: string;
  publicationEnd?: string | null;
  sourceStatus?: string | null;
  schedules?: Schedule[];
  quality?: QualityIssue[];
  provenance?: { method: CollectionMethod; reviewStatus: 'unverified' };
}
export interface SupplyPrice {
  model: string;
  housingType: string;
  supplyArea: string | null;
  units: number | null;
  maximumWon: number | null;
}
export interface StoredNotice extends Notice {
  updatedAt: string;
  lastSeenAt: string;
  favorite: boolean;
  version: number;
}
export interface MatchResult {
  preference: PreferenceAssessment;
  status: MatchStatus;
  score: number;
  reasons: string[];
  missing: string[];
  failed: string[];
  basisDate: string | null;
  stage: NoticeStage;
}
export type PreferenceState = 'matched' | 'mismatch' | 'unknown' | 'unset';
export interface PreferenceCheck {
  field: 'region' | 'type' | 'price' | 'deposit' | 'monthly';
  label: string;
  state: PreferenceState;
  message: string;
}
export interface PreferenceAssessment {
  state: PreferenceState;
  checks: PreferenceCheck[];
}
export interface MatchedNotice extends StoredNotice {
  match: MatchResult;
}
export interface ImportFormat {
  id: string;
  label: string;
  source: ApiSource;
  operation?: string;
}
export interface CollectionRun {
  id: number;
  sourceId: string;
  status: 'running' | 'success' | 'failed';
  count: number;
  message: string | null;
  method: CollectionMethod;
  warnings: number;
  errorCode: string | null;
  startedAt: string;
  endedAt: string | null;
}
export interface CollectionConfig {
  lookbackDays: number;
  from: string;
  to: string;
  configured: Record<ApiSource, boolean>;
}
export interface ConnectionInfo extends CollectionConfig {
  error?: string;
  environment: { exists: boolean; restartRequired: boolean };
  importFormats: ImportFormat[];
  maxImportBytes: number;
}
export interface SourceInfo {
  id: ApiSource;
  name: string;
  scope: string;
  status: 'adapter' | 'planned';
  url: string | null;
  configured: boolean;
  count: number;
}
export interface QualitySummary {
  webCount: number;
  total: number;
  apiCount: number;
  importedCount: number;
  needsReview: number;
  missingSchedule: number;
  missingPrice: number;
}
export interface BootstrapData {
  profile: Profile;
  notices: MatchedNotice[];
  regions: string[];
  today: string;
  sources: SourceInfo[];
  runs: CollectionRun[];
  collecting: boolean;
  connection: ConnectionInfo;
  quality: QualitySummary;
}
export interface Filters {
  openOnly: boolean;
  excludeMismatch: boolean;
  search: string;
  region: string;
  type: HousingType | '';
  dataMode: 'demo' | 'live' | 'both';
  status: MatchStatus | '';
  sort: 'recommended' | 'deadline' | 'recent';
}
export type FilterChange = <K extends keyof Filters>(key: K, value: Filters[K]) => void;
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}
export type RequestFn = <T = unknown>(path: string, options?: RequestOptions) => Promise<T>;
export interface ImportInput {
  format: string;
  payload: unknown;
}
export interface ImportResult {
  count: number;
  changes: number;
  warnings: number;
  method: 'file-import';
}
export interface CollectionResult {
  source: ApiSource;
  status: 'success' | 'failed' | 'unconfigured';
  count: number;
  message: string;
  changes?: number;
  warnings?: number;
  code?: string;
}
export type FetchJSON = (
  url: URL,
  options: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function errorMessage(error: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  return error instanceof Error ? error.message : fallback;
}
export function errorCode(error: unknown): string {
  return isRecord(error) && typeof error.code === 'string' ? error.code : '';
}
