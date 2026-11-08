import type { Notice, StoredNotice, SourceInfo, Profile, CollectionRun, CollectionMethod } from '@cheongyak-moa/contracts';
interface DbNotice {body: string; updated_at: string; last_seen_at: string; favorite: number; version: number;}
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { demoNotices } from './demo.js';

export const sources: Omit<SourceInfo,'configured'|'count'>[] = [
  { id: 'applyhome', name: '청약홈', scope: 'APT·무순위·오피스텔 등', status: 'adapter', url: 'https://www.data.go.kr/data/15098547/openapi.do' },
  { id: 'lh', name: 'LH 청약플러스', scope: '분양·임대 공고 목록', status: 'adapter', url: 'https://www.data.go.kr/data/15058530/openapi.do' },
  { id: 'sh', name: 'SH', scope: '서울 지역 자체 공고', status: 'planned', url: 'https://www.i-sh.co.kr/' },
  { id: 'gh', name: 'GH', scope: '경기 지역 자체 공고', status: 'planned', url: 'https://www.gh.or.kr/' },
  { id: 'local', name: '지방공사·지자체', scope: '기관별 조사·연동 예정', status: 'planned', url: null }
];
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string, { seed = true }: {seed?: boolean} = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS notices(id TEXT PRIMARY KEY, source_id TEXT NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL, updated_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notice_versions(id INTEGER PRIMARY KEY, notice_id TEXT NOT NULL REFERENCES notices(id), version INTEGER NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(notice_id,version));
      CREATE TABLE IF NOT EXISTS profile(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS favorites(notice_id TEXT PRIMARY KEY REFERENCES notices(id));
      CREATE TABLE IF NOT EXISTS collection_runs(id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, status TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, message TEXT, started_at TEXT NOT NULL, ended_at TEXT);
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    const runColumns = new Set(this.db.prepare('PRAGMA table_info(collection_runs)').all().map(c => c.name));
    if (!runColumns.has('method')) this.db.exec("ALTER TABLE collection_runs ADD COLUMN method TEXT NOT NULL DEFAULT 'api'");
    if (!runColumns.has('warnings')) this.db.exec('ALTER TABLE collection_runs ADD COLUMN warnings INTEGER NOT NULL DEFAULT 0');
    if (!runColumns.has('error_code')) this.db.exec('ALTER TABLE collection_runs ADD COLUMN error_code TEXT');
    if (seed && !this.db.prepare("SELECT value FROM meta WHERE key='demo-seeded'").get()) {
      for (const n of demoNotices()) this.upsert(n);
      this.db.prepare("INSERT INTO meta(key,value) VALUES('demo-seeded','1')").run();
    }
  }
  transaction<T>(callback: () => T): T {
    this.db.exec('BEGIN');
    try { const value = callback(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  upsert(notice: Notice): boolean { return this.transaction(() => this.writeNotice(notice)); }
  upsertBatch(notices: Notice[]): number { return this.transaction(() => notices.reduce((count, notice) => count + Number(this.writeNotice(notice)), 0)); }
  writeNotice(notice: Notice): boolean {
    const body = JSON.stringify(notice), hash = createHash('sha256').update(body).digest('hex');
    const old = this.db.prepare('SELECT hash FROM notices WHERE id=?').get(notice.id) as {hash: string} | undefined;
    const now = new Date().toISOString();
      if (old?.hash === hash) {
        this.db.prepare('UPDATE notices SET last_seen_at=? WHERE id=?').run(now, notice.id);
        return false;
      }
      this.db.prepare('INSERT INTO notices VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,hash=excluded.hash,updated_at=excluded.updated_at,last_seen_at=excluded.last_seen_at').run(notice.id, notice.sourceId, body, hash, now, now);
      const v = this.db.prepare('SELECT COALESCE(MAX(version),0)+1 AS v FROM notice_versions WHERE notice_id=?').get(notice.id) as {v: number};
      this.db.prepare('INSERT INTO notice_versions(notice_id,version,body,hash,created_at) VALUES(?,?,?,?,?)').run(notice.id,v.v,body,hash,now);
      return true;
  }
  all(): StoredNotice[] {
    return (this.db.prepare('SELECT n.*, EXISTS(SELECT 1 FROM favorites f WHERE f.notice_id=n.id) AS favorite, (SELECT MAX(version) FROM notice_versions v WHERE v.notice_id=n.id) AS version FROM notices n').all() as unknown as DbNotice[]).map(r => ({ ...JSON.parse(r.body), updatedAt: r.updated_at, lastSeenAt: r.last_seen_at, favorite: !!r.favorite, version: r.version }));
  }
  get(id: string) { return this.all().find(n => n.id === id); }
  versions(id: string): {version: number; createdAt: string; body: Notice}[] { return (this.db.prepare('SELECT version,created_at AS createdAt,body FROM notice_versions WHERE notice_id=? ORDER BY version DESC').all(id) as unknown as {version: number; createdAt: string; body: string}[]).map(v => ({ ...v, body: JSON.parse(v.body) })); }
  profile(): Profile { const r = this.db.prepare('SELECT body FROM profile WHERE id=1').get() as {body: string} | undefined; return r ? JSON.parse(r.body) : {}; }
  saveProfile(p: Profile) { this.db.prepare('INSERT INTO profile VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(JSON.stringify(p), new Date().toISOString()); }
  erasePersonal() { this.db.exec('DELETE FROM profile; DELETE FROM favorites; PRAGMA wal_checkpoint(TRUNCATE);'); }
  favorite(id: string, saved: boolean) {
    if (!this.get(id)) throw new Error('공고를 찾을 수 없습니다.');
    if (saved) this.db.prepare('INSERT OR IGNORE INTO favorites VALUES(?)').run(id);
    else this.db.prepare('DELETE FROM favorites WHERE notice_id=?').run(id);
  }
  beginRun(sourceId: string, method: CollectionMethod = 'api') { return Number(this.db.prepare("INSERT INTO collection_runs(source_id,status,started_at,method) VALUES(?,'running',?,?)").run(sourceId, new Date().toISOString(),method).lastInsertRowid); }
  finishRun(id: number, status: 'success'|'failed', count: number, message: string, warnings = 0, errorCode: string | null = null) { this.db.prepare('UPDATE collection_runs SET status=?,count=?,message=?,ended_at=?,warnings=?,error_code=? WHERE id=?').run(status,count,message,new Date().toISOString(),warnings,errorCode,id); }
  runs(): CollectionRun[] { return this.db.prepare('SELECT id,source_id AS sourceId,status,count,message,method,warnings,error_code AS errorCode,started_at AS startedAt,ended_at AS endedAt FROM collection_runs ORDER BY id DESC LIMIT 30').all() as unknown as CollectionRun[]; }
  close() { this.db.close(); }
}
