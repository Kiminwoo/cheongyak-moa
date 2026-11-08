import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { demoNotices } from './demo.js';

export const sources = [
  { id: 'applyhome', name: '청약홈', scope: 'APT·무순위·오피스텔 등', status: 'adapter', url: 'https://www.data.go.kr/data/15098547/openapi.do' },
  { id: 'lh', name: 'LH 청약플러스', scope: '분양·임대 공고 목록', status: 'adapter', url: 'https://www.data.go.kr/data/15058530/openapi.do' },
  { id: 'sh', name: 'SH', scope: '서울 지역 자체 공고', status: 'planned', url: 'https://www.i-sh.co.kr/' },
  { id: 'gh', name: 'GH', scope: '경기 지역 자체 공고', status: 'planned', url: 'https://www.gh.or.kr/' },
  { id: 'local', name: '지방공사·지자체', scope: '기관별 조사·연동 예정', status: 'planned', url: null }
];
export class Store {
  constructor(path, { seed = true } = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS notices(id TEXT PRIMARY KEY, source_id TEXT NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL, updated_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notice_versions(id INTEGER PRIMARY KEY, notice_id TEXT NOT NULL REFERENCES notices(id), version INTEGER NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(notice_id,version));
      CREATE TABLE IF NOT EXISTS profile(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS favorites(notice_id TEXT PRIMARY KEY REFERENCES notices(id));
      CREATE TABLE IF NOT EXISTS collection_runs(id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, status TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, message TEXT, started_at TEXT NOT NULL, ended_at TEXT);
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    if (seed && !this.db.prepare("SELECT value FROM meta WHERE key='demo-seeded'").get()) {
      for (const n of demoNotices()) this.upsert(n);
      this.db.prepare("INSERT INTO meta(key,value) VALUES('demo-seeded','1')").run();
    }
  }
  upsert(notice) {
    const body = JSON.stringify(notice), hash = createHash('sha256').update(body).digest('hex');
    const old = this.db.prepare('SELECT hash FROM notices WHERE id=?').get(notice.id);
    const now = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      if (old?.hash === hash) {
        this.db.prepare('UPDATE notices SET last_seen_at=? WHERE id=?').run(now, notice.id);
        this.db.exec('COMMIT'); return false;
      }
      this.db.prepare('INSERT INTO notices VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,hash=excluded.hash,updated_at=excluded.updated_at,last_seen_at=excluded.last_seen_at').run(notice.id, notice.sourceId, body, hash, now, now);
      const v = this.db.prepare('SELECT COALESCE(MAX(version),0)+1 AS v FROM notice_versions WHERE notice_id=?').get(notice.id).v;
      this.db.prepare('INSERT INTO notice_versions(notice_id,version,body,hash,created_at) VALUES(?,?,?,?,?)').run(notice.id,v,body,hash,now);
      this.db.exec('COMMIT'); return true;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  all() {
    return this.db.prepare('SELECT n.*, EXISTS(SELECT 1 FROM favorites f WHERE f.notice_id=n.id) AS favorite, (SELECT MAX(version) FROM notice_versions v WHERE v.notice_id=n.id) AS version FROM notices n').all().map(r => ({ ...JSON.parse(r.body), updatedAt: r.updated_at, lastSeenAt: r.last_seen_at, favorite: !!r.favorite, version: r.version }));
  }
  get(id) { return this.all().find(n => n.id === id); }
  versions(id) { return this.db.prepare('SELECT version,created_at AS createdAt,body FROM notice_versions WHERE notice_id=? ORDER BY version DESC').all(id).map(v => ({ ...v, body: JSON.parse(v.body) })); }
  profile() { const r = this.db.prepare('SELECT body FROM profile WHERE id=1').get(); return r ? JSON.parse(r.body) : {}; }
  saveProfile(p) { this.db.prepare('INSERT INTO profile VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(JSON.stringify(p), new Date().toISOString()); }
  erasePersonal() { this.db.exec('DELETE FROM profile; DELETE FROM favorites; PRAGMA wal_checkpoint(TRUNCATE);'); }
  favorite(id, saved) {
    if (!this.get(id)) throw new Error('공고를 찾을 수 없습니다.');
    if (saved) this.db.prepare('INSERT OR IGNORE INTO favorites VALUES(?)').run(id);
    else this.db.prepare('DELETE FROM favorites WHERE notice_id=?').run(id);
  }
  beginRun(sourceId) { return Number(this.db.prepare("INSERT INTO collection_runs(source_id,status,started_at) VALUES(?,'running',?)").run(sourceId, new Date().toISOString()).lastInsertRowid); }
  finishRun(id, status, count, message) { this.db.prepare('UPDATE collection_runs SET status=?,count=?,message=?,ended_at=? WHERE id=?').run(status,count,message,new Date().toISOString(),id); }
  runs() { return this.db.prepare('SELECT id,source_id AS sourceId,status,count,message,started_at AS startedAt,ended_at AS endedAt FROM collection_runs ORDER BY id DESC LIMIT 30').all(); }
  close() { this.db.close(); }
}
