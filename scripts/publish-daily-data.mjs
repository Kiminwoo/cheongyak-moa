import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, rmSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = 'apps/api/snapshots/public-notices.snapshot.json';
const message = 'chore(data): publish daily housing notices';
const acceptedRemote =
  /^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)Kiminwoo\/cheongyak-moa(?:\.git)?$/i;
const lockPath = new URL('../data/daily-refresh.lock', import.meta.url);
let lock;
let log;

function logLine(line) {
  console.log(line);
  if (log != null) writeSync(log, line + '\n');
}

function run(command, args, { stream = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    stdio: stream ? ['ignore', log, log] : ['ignore', 'pipe', log],
  });
  if (result.status !== 0) throw new Error(`실행 실패 (${command} ${args[0]})`);
  return result.stdout?.trim() || '';
}
const git = (...args) => run('git', args);

try {
  mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
  lock = openSync(lockPath, 'wx');
  log = openSync(new URL('../data/daily-refresh.log', import.meta.url), 'w', 0o600);
  logLine(`[${new Date().toISOString()}] 청약 공고 일일 갱신 시작`);
  if (git('branch', '--show-current') !== 'main' || git('status', '--porcelain'))
    throw new Error('변경 사항이 없는 수집 전용 main 체크아웃이 필요합니다.');
  if (
    !acceptedRemote.test(git('remote', 'get-url', 'origin')) ||
    !acceptedRemote.test(git('remote', 'get-url', '--push', 'origin'))
  )
    throw new Error('청약모아 저장소의 origin을 확인해 주세요.');

  git('fetch', '--no-tags', 'origin', 'main');
  git('merge', '--ff-only', 'FETCH_HEAD');
  // 직전 배포 푸시만 실패했다면 그 공개 사본 커밋만 재시도합니다.
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'FETCH_HEAD')) {
    if (
      git('rev-parse', 'HEAD^') !== git('rev-parse', 'FETCH_HEAD') ||
      git('log', '-1', '--format=%s') !== message ||
      git('diff', '--name-only', 'FETCH_HEAD', 'HEAD') !== snapshot
    )
      throw new Error('수집 전용 main에 배포 작업 이외의 커밋이 있습니다.');
  } else {
    run(process.execPath, ['scripts/build.mjs', 'api'], { stream: true });
    run(
      process.execPath,
      [
        '--experimental-sqlite',
        '--env-file-if-exists=.env',
        'apps/api/dist/cli/refresh-data.mjs',
        '--daily',
      ],
      { stream: true },
    );
    if (git('status', '--porcelain') !== `M ${snapshot}`)
      throw new Error('검증된 공개 사본 변경을 확인해 주세요.');
    try {
      git('commit', '-m', message, '--only', '--', snapshot);
    } catch (error) {
      // 배포 커밋이 생성되기 전에는 이번에 생성한 사본을 되돌려 다음 예약 작업에서 재수집합니다.
      if (git('rev-parse', 'HEAD') === git('rev-parse', 'FETCH_HEAD')) {
        git('restore', '--worktree', '--', snapshot);
      }
      throw error;
    }
  }
  git('push', 'origin', 'HEAD:refs/heads/main');
  logLine(`[${new Date().toISOString()}] 공개 사본 푸시 완료 · Vercel 자동 배포 요청`);
} catch (error) {
  logLine(
    lock == null && error.code === 'EEXIST'
      ? '일일 갱신이 이미 실행 중입니다.'
      : `일일 갱신 종료 · ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  if (log != null) closeSync(log);
  if (lock != null) {
    closeSync(lock);
    rmSync(lockPath);
  }
}
